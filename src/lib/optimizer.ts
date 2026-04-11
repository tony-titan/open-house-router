import { House } from '@/types';
import { getTimeMatrix, getRouteGeometry, getTrafficMultiplier } from './osrm';

interface OptimizationInput {
  houses: House[];
  startLat: number;
  startLng: number;
  dayStartTime: Date;
  dayEndTime: Date;
  timePerStopMinutes: number;
  excludeHouseIds: number[];
  claimedHouseIds?: number[];
  favoritedHouseIds?: number[];
  isWeekend?: boolean;
}

interface PlannedStop {
  house: House;
  arrival_time: Date;
  departure_time: Date;
  travel_time_minutes: number;
}

export interface OptimizationResult {
  stops: PlannedStop[];
  totalTravelMinutes: number;
  totalHouses: number;
  routeGeometry: [number, number][][] | null;
}

interface CandidateInfo {
  house: House;
  index: number;
  startMs: number;
  endMs: number;
  isFavorited: boolean;
  isClaimed: boolean;
}

export async function optimizeRoute(input: OptimizationInput): Promise<OptimizationResult> {
  const { houses, startLat, startLng, dayStartTime, dayEndTime, timePerStopMinutes, excludeHouseIds, claimedHouseIds, favoritedHouseIds, isWeekend: isWeekendInput } = input;

  const excludeSet = new Set(excludeHouseIds);
  const claimedSet = new Set(claimedHouseIds || []);
  const favoritedSet = new Set(favoritedHouseIds || []);
  const dayStartMs = dayStartTime.getTime();
  const dayEndMs = dayEndTime.getTime();
  const stopMs = timePerStopMinutes * 60 * 1000;
  const weekend = isWeekendInput ?? (dayStartTime.getDay() === 0 || dayStartTime.getDay() === 6);

  const MAX_WINDOW_MS = 8 * 60 * 60 * 1000; // 8 hours

  const candidates: CandidateInfo[] = [];
  houses.forEach((h, idx) => {
    if (excludeSet.has(h.id)) return;
    const hStartMs = new Date(h.open_house_start).getTime();
    const hEndMs = new Date(h.open_house_end).getTime();
    if (hEndMs - hStartMs > MAX_WINDOW_MS || hEndMs <= hStartMs) return;
    if (hEndMs > dayStartMs && hStartMs < dayEndMs) {
      candidates.push({ house: h, index: idx, startMs: hStartMs, endMs: hEndMs, isFavorited: favoritedSet.has(h.id), isClaimed: claimedSet.has(h.id) });
    }
  });

  if (candidates.length === 0) {
    return { stops: [], totalTravelMinutes: 0, totalHouses: 0, routeGeometry: null };
  }

  const allCoords: [number, number][] = [
    [startLat, startLng],
    ...candidates.map((c) => [c.house.latitude, c.house.longitude] as [number, number]),
  ];

  const matrix = await getTimeMatrix(allCoords);
  const durationsMs = matrix.durations.map((row) => row.map((d) => d * 1000));

  const route = greedyOptimize(candidates, durationsMs, dayStartMs, dayEndMs, stopMs, weekend);

  const improved = route.length > 2 && route.length <= 30
    ? twoOptImprove(route, candidates, durationsMs, dayStartMs, stopMs, dayEndMs, weekend)
    : route;

  let totalTravelMinutes = 0;
  const stops: PlannedStop[] = [];
  let currentTimeMs = dayStartMs;
  let currentIndex = 0;

  for (const candIdx of improved) {
    const cand = candidates[candIdx];
    const matrixIdx = candIdx + 1;
    const multiplier = getTrafficMultiplier(currentTimeMs, weekend);
    const travelMs = durationsMs[currentIndex][matrixIdx] * multiplier;
    const travelMinutes = travelMs / 60000;

    const arrivalMs = currentTimeMs + travelMs;
    const effectiveArrivalMs = Math.max(arrivalMs, cand.startMs);
    const departureMs = effectiveArrivalMs + stopMs;

    if (effectiveArrivalMs >= cand.endMs || departureMs > cand.endMs || departureMs > dayEndMs) {
      continue;
    }

    stops.push({
      house: cand.house,
      arrival_time: new Date(effectiveArrivalMs),
      departure_time: new Date(departureMs),
      travel_time_minutes: travelMinutes,
    });

    totalTravelMinutes += travelMinutes;
    currentTimeMs = departureMs;
    currentIndex = matrixIdx;
  }

  let geometry: [number, number][][] | null = null;
  if (stops.length > 0 && stops.length <= 25) {
    const routeCoords: [number, number][] = [
      [startLat, startLng],
      ...stops.map((s) => [s.house.latitude, s.house.longitude] as [number, number]),
    ];
    geometry = await getRouteGeometry(routeCoords);
  }

  return {
    stops,
    totalTravelMinutes,
    totalHouses: stops.length,
    routeGeometry: geometry,
  };
}

function greedyOptimize(
  candidates: CandidateInfo[],
  durationsMs: number[][],
  dayStartMs: number,
  dayEndMs: number,
  stopMs: number,
  isWeekend: boolean
): number[] {
  const n = candidates.length;
  const visited = new Set<number>();
  const route: number[] = [];
  let currentTimeMs = dayStartMs;
  let currentIdx = 0;

  while (visited.size < n) {
    let bestScore = -Infinity;
    let bestCandidate = -1;
    const multiplier = getTrafficMultiplier(currentTimeMs, isWeekend);

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;

      const cand = candidates[i];
      const matrixIdx = i + 1;
      const travelMs = durationsMs[currentIdx][matrixIdx] * multiplier;
      const arrivalMs = currentTimeMs + travelMs;

      if (arrivalMs >= cand.endMs) continue;

      const effectiveArrivalMs = Math.max(arrivalMs, cand.startMs);
      const departureMs = effectiveArrivalMs + stopMs;

      if (departureMs > dayEndMs) continue;
      if (departureMs > cand.endMs) continue;

      const waitMinutes = (effectiveArrivalMs - arrivalMs) / 60000;
      const travelMinutes = travelMs / 60000;
      const timeUntilClose = (cand.endMs - effectiveArrivalMs) / 60000;
      const stopMinutes = stopMs / 60000;

      const coverageRatio = timeUntilClose / stopMinutes;
      const fitScore = Math.min(coverageRatio, 3.0) * 5;
      const urgency = timeUntilClose < 45 ? (45 - timeUntilClose) / 15 : 0;
      const favoriteBonus = cand.isFavorited ? 100 : 0;
      const claimedPenalty = cand.isClaimed ? -50 : 0;
      const score = -travelMinutes * 1.0 - waitMinutes * 0.5 + urgency * 10 + fitScore + favoriteBonus + claimedPenalty;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = i;
      }
    }

    if (bestCandidate === -1) break;

    visited.add(bestCandidate);
    route.push(bestCandidate);

    const cand = candidates[bestCandidate];
    const matrixIdx = bestCandidate + 1;
    const travelMs = durationsMs[currentIdx][matrixIdx] * multiplier;
    const arrivalMs = currentTimeMs + travelMs;
    const effectiveArrivalMs = Math.max(arrivalMs, cand.startMs);

    currentTimeMs = effectiveArrivalMs + stopMs;
    currentIdx = matrixIdx;
  }

  return route;
}

function twoOptImprove(
  route: number[],
  candidates: CandidateInfo[],
  durationsMs: number[][],
  dayStartMs: number,
  stopMs: number,
  dayEndMs: number,
  isWeekend: boolean
): number[] {
  let best = [...route];
  let improved = true;
  let iterations = 0;
  const maxIterations = 20;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const newRoute = [...best];
        const segment = newRoute.slice(i, j + 1).reverse();
        newRoute.splice(i, j - i + 1, ...segment);

        if (isRouteFeasible(newRoute, candidates, durationsMs, dayStartMs, stopMs, dayEndMs, isWeekend)) {
          const oldCost = routeTravelTime(best, durationsMs);
          const newCost = routeTravelTime(newRoute, durationsMs);
          if (newCost < oldCost) {
            best = newRoute;
            improved = true;
          }
        }
      }
    }
  }

  return best;
}

function routeTravelTime(route: number[], durationsMs: number[][]): number {
  let total = 0;
  let prev = 0;
  for (const idx of route) {
    total += durationsMs[prev][idx + 1];
    prev = idx + 1;
  }
  return total;
}

function isRouteFeasible(
  route: number[],
  candidates: CandidateInfo[],
  durationsMs: number[][],
  dayStartMs: number,
  stopMs: number,
  dayEndMs: number,
  isWeekend: boolean
): boolean {
  let currentTimeMs = dayStartMs;
  let currentIdx = 0;

  for (const candIdx of route) {
    const cand = candidates[candIdx];
    const matrixIdx = candIdx + 1;
    const multiplier = getTrafficMultiplier(currentTimeMs, isWeekend);
    const travelMs = durationsMs[currentIdx][matrixIdx] * multiplier;
    const arrivalMs = currentTimeMs + travelMs;

    if (arrivalMs >= cand.endMs) return false;

    const effectiveArrivalMs = Math.max(arrivalMs, cand.startMs);
    const departureMs = effectiveArrivalMs + stopMs;
    if (departureMs > dayEndMs) return false;
    if (departureMs > cand.endMs) return false;

    currentTimeMs = departureMs;
    currentIdx = matrixIdx;
  }

  return true;
}
