import { House } from '@/types';
import { getTimeMatrix, getRouteGeometry } from './osrm';

interface OptimizationInput {
  houses: House[];
  startLat: number;
  startLng: number;
  dayStartTime: Date;
  dayEndTime: Date;
  timePerStopMinutes: number;
  excludeHouseIds: number[];
  favoritedHouseIds?: number[];
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
}

export async function optimizeRoute(input: OptimizationInput): Promise<OptimizationResult> {
  const { houses, startLat, startLng, dayStartTime, dayEndTime, timePerStopMinutes, excludeHouseIds, favoritedHouseIds } = input;

  const excludeSet = new Set(excludeHouseIds);
  const favoritedSet = new Set(favoritedHouseIds || []);
  const dayStartMs = dayStartTime.getTime();
  const dayEndMs = dayEndTime.getTime();
  const stopMs = timePerStopMinutes * 60 * 1000;

  const candidates: CandidateInfo[] = [];
  houses.forEach((h, idx) => {
    if (excludeSet.has(h.id)) return;
    const hStartMs = new Date(h.open_house_start).getTime();
    const hEndMs = new Date(h.open_house_end).getTime();
    if (hEndMs > dayStartMs && hStartMs < dayEndMs) {
      candidates.push({ house: h, index: idx, startMs: hStartMs, endMs: hEndMs, isFavorited: favoritedSet.has(h.id) });
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

  const route = greedyOptimize(candidates, durationsMs, dayStartMs, dayEndMs, stopMs);

  const improved = route.length > 2 && route.length <= 30
    ? twoOptImprove(route, candidates, durationsMs, dayStartMs, stopMs, dayEndMs)
    : route;

  let totalTravelMinutes = 0;
  const stops: PlannedStop[] = [];
  let currentTimeMs = dayStartMs;
  let currentIndex = 0;

  for (const candIdx of improved) {
    const cand = candidates[candIdx];
    const matrixIdx = candIdx + 1;
    const travelMs = durationsMs[currentIndex][matrixIdx];
    const travelMinutes = travelMs / 60000;

    const arrivalMs = currentTimeMs + travelMs;
    const effectiveArrivalMs = Math.max(arrivalMs, cand.startMs);
    const departureMs = effectiveArrivalMs + stopMs;

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
  stopMs: number
): number[] {
  const n = candidates.length;
  const visited = new Set<number>();
  const route: number[] = [];
  let currentTimeMs = dayStartMs;
  let currentIdx = 0;

  while (visited.size < n) {
    let bestScore = -Infinity;
    let bestCandidate = -1;

    for (let i = 0; i < n; i++) {
      if (visited.has(i)) continue;

      const cand = candidates[i];
      const matrixIdx = i + 1;
      const travelMs = durationsMs[currentIdx][matrixIdx];
      const arrivalMs = currentTimeMs + travelMs;

      if (arrivalMs >= cand.endMs) continue;

      const effectiveArrivalMs = Math.max(arrivalMs, cand.startMs);
      const departureMs = effectiveArrivalMs + stopMs;

      if (departureMs > dayEndMs) continue;

      const waitMinutes = (effectiveArrivalMs - arrivalMs) / 60000;
      const travelMinutes = travelMs / 60000;
      const remainingWindowMinutes = (cand.endMs - effectiveArrivalMs) / 60000;

      const urgency = remainingWindowMinutes < 30 ? 2.0 : remainingWindowMinutes < 60 ? 1.0 : 0.0;
      const favoriteBonus = cand.isFavorited ? 100 : 0;
      const score = -travelMinutes * 1.0 - waitMinutes * 0.5 + urgency * 10 + favoriteBonus;

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
    const travelMs = durationsMs[currentIdx][matrixIdx];
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
  dayEndMs: number
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

        if (isRouteFeasible(newRoute, candidates, durationsMs, dayStartMs, stopMs, dayEndMs)) {
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
  dayEndMs: number
): boolean {
  let currentTimeMs = dayStartMs;
  let currentIdx = 0;

  for (const candIdx of route) {
    const cand = candidates[candIdx];
    const matrixIdx = candIdx + 1;
    const travelMs = durationsMs[currentIdx][matrixIdx];
    const arrivalMs = currentTimeMs + travelMs;

    if (arrivalMs >= cand.endMs) return false;

    const effectiveArrivalMs = Math.max(arrivalMs, cand.startMs);
    const departureMs = effectiveArrivalMs + stopMs;
    if (departureMs > dayEndMs) return false;

    currentTimeMs = departureMs;
    currentIdx = matrixIdx;
  }

  return true;
}
