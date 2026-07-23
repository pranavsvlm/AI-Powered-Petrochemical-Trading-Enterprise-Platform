import { computeRetentionExpiry, isPastRetention } from './retention';

describe('computeRetentionExpiry', () => {
  it('adds durationDays to the given date', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const expiry = computeRetentionExpiry(from, { name: '90-day', durationDays: 90 });
    expect(expiry.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('does not mutate the input date', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    computeRetentionExpiry(from, { name: '30-day', durationDays: 30 });
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('isPastRetention', () => {
  it('returns false for a null retention date', () => {
    expect(isPastRetention(null)).toBe(false);
  });

  it('returns true when the retention date is in the past', () => {
    const past = new Date('2020-01-01T00:00:00.000Z');
    expect(isPastRetention(past, new Date('2026-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('returns false when the retention date is in the future', () => {
    const future = new Date('2030-01-01T00:00:00.000Z');
    expect(isPastRetention(future, new Date('2026-01-01T00:00:00.000Z'))).toBe(false);
  });

  it('treats an exact-now retention date as past (boundary is inclusive)', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(isPastRetention(now, now)).toBe(true);
  });
});
