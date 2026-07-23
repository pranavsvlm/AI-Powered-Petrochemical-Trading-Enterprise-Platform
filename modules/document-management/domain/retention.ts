/** Duration units a company's retention policy can be configured in (doc 21 gives no concrete numbers — see docs/DOMAIN_MODEL_PHASE3.md §9). */
export interface RetentionPolicy {
  name: string;
  durationDays: number;
}

/**
 * Pure date-arithmetic — kept separate from the repository so it's trivially unit-testable.
 * Uses UTC date methods deliberately: `setDate`/`getDate` operate in the host's local
 * timezone, which would make this function's output (and its tests) depend on where the
 * process happens to run.
 */
export function computeRetentionExpiry(from: Date, policy: RetentionPolicy): Date {
  const expiry = new Date(from.getTime());
  expiry.setUTCDate(expiry.getUTCDate() + policy.durationDays);
  return expiry;
}

export function isPastRetention(retentionExpiresAt: Date | null, now: Date = new Date()): boolean {
  return retentionExpiresAt !== null && retentionExpiresAt.getTime() <= now.getTime();
}
