import { computeBackoffMs, hasExceededMaxRetries } from './backoff';

describe('computeBackoffMs', () => {
  it('doubles each attempt', () => {
    expect(computeBackoffMs(1, 500, 30000)).toBe(500);
    expect(computeBackoffMs(2, 500, 30000)).toBe(1000);
    expect(computeBackoffMs(3, 500, 30000)).toBe(2000);
  });

  it('caps at maxMs', () => {
    expect(computeBackoffMs(20, 500, 30000)).toBe(30000);
  });
});

describe('hasExceededMaxRetries', () => {
  it('returns false while under the limit', () => {
    expect(hasExceededMaxRetries(3, 5)).toBe(false);
  });

  it('returns true at or above the limit', () => {
    expect(hasExceededMaxRetries(5, 5)).toBe(true);
    expect(hasExceededMaxRetries(6, 5)).toBe(true);
  });
});
