/**
 * Exponential backoff with a cap, used to decide how long to wait before a retry
 * and, cumulatively, whether an event should be dead-lettered.
 */
export function computeBackoffMs(attempt: number, baseMs = 500, maxMs = 30_000): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  return exp;
}

export function hasExceededMaxRetries(attempts: number, maxRetries: number): boolean {
  return attempts >= maxRetries;
}
