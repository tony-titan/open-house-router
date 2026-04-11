/**
 * In-memory sliding window rate limiter.
 *
 * Safe for single-instance deployments (Fly.io single machine).
 * Each key (typically "ip:tier") tracks recent request timestamps.
 * Stale entries are pruned lazily on access and periodically via a
 * background sweep every CLEANUP_INTERVAL_MS.
 */

const store = new Map<string, number[]>();

const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    store.forEach((timestamps, key) => {
      const filtered = timestamps.filter((t: number) => now - t < 300_000);
      if (filtered.length === 0) {
        store.delete(key);
      } else {
        store.set(key, filtered);
      }
    });
  }, CLEANUP_INTERVAL_MS);
  // Don't prevent Node from exiting
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check whether a key has exceeded its rate limit and record the attempt.
 *
 * @param key     Unique identifier (e.g. "192.168.1.1:global")
 * @param limit   Max allowed requests within the window
 * @param windowMs  Sliding window duration in milliseconds
 * @returns true if the request should be BLOCKED
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  ensureCleanup();

  const now = Date.now();
  const cutoff = now - windowMs;

  let timestamps = store.get(key);
  if (timestamps) {
    timestamps = timestamps.filter((t) => t > cutoff);
  } else {
    timestamps = [];
  }

  if (timestamps.length >= limit) {
    store.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  store.set(key, timestamps);
  return false;
}

/**
 * Return the number of seconds until the oldest entry in the window expires.
 * Used for the Retry-After header.
 */
export function retryAfterSeconds(key: string, windowMs: number): number {
  const timestamps = store.get(key);
  if (!timestamps || timestamps.length === 0) return 1;
  const oldest = Math.min(...timestamps);
  const expiresAt = oldest + windowMs;
  return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
}
