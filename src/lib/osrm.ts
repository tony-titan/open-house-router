const OSRM_BASE = 'https://router.project-osrm.org';

export interface DurationMatrix {
  durations: number[][]; // seconds
  distances: number[][]; // meters
}

/**
 * Fetch a travel time/distance matrix from OSRM for all given coordinates.
 * coords: Array of [lat, lng]
 * Returns duration matrix in seconds and distance matrix in meters.
 */
export async function getTimeMatrix(coords: [number, number][]): Promise<DurationMatrix> {
  if (coords.length < 2) {
    return { durations: [[0]], distances: [[0]] };
  }

  if (coords.length > 100) {
    return estimateMatrix(coords);
  }

  const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_BASE}/table/v1/driving/${coordStr}?annotations=duration,distance`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`OSRM table API returned ${response.status}`);
    const data = await response.json();
    if (data.code !== 'Ok') throw new Error(`OSRM error: ${data.code}`);
    return {
      durations: data.durations,
      distances: data.distances,
    };
  } catch (error) {
    console.warn('OSRM table API failed, using distance estimates:', error);
    return estimateMatrix(coords);
  }
}

/**
 * Get the driving route geometry between ordered waypoints.
 * Returns array of [lat, lng] coordinate arrays (one per leg).
 */
export async function getRouteGeometry(coords: [number, number][]): Promise<[number, number][][] | null> {
  if (coords.length < 2) return null;

  const coordStr = coords.map(([lat, lng]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (data.code !== 'Ok') return null;

    const routeCoords: [number, number][] = data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );

    const legBreaks: number[] = [];
    let totalDist = 0;
    for (const leg of data.routes[0].legs) {
      totalDist += leg.distance;
      legBreaks.push(totalDist);
    }

    return [routeCoords];
  } catch {
    return null;
  }
}

function estimateMatrix(coords: [number, number][]): DurationMatrix {
  const AVG_SPEED_MPS = 13.4; // ~30 mph in m/s for suburban driving
  const DETOUR_FACTOR = 1.4;

  const n = coords.length;
  const durations: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const distances: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const dist = haversineDistance(coords[i], coords[j]) * DETOUR_FACTOR;
      distances[i][j] = dist;
      durations[i][j] = dist / AVG_SPEED_MPS;
    }
  }

  return { durations, distances };
}

function haversineDistance([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
