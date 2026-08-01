import { computeDurationMinutes, InvalidTimeEntryError } from './time-tracking';

describe('computeDurationMinutes', () => {
  it('computes whole minutes between two timestamps', () => {
    const start = new Date('2026-08-01T09:00:00Z');
    const end = new Date('2026-08-01T09:45:00Z');
    expect(computeDurationMinutes(start, end)).toBe(45);
  });

  it('rounds down partial minutes', () => {
    const start = new Date('2026-08-01T09:00:00.000Z');
    const end = new Date('2026-08-01T09:00:59.999Z');
    expect(computeDurationMinutes(start, end)).toBe(0);
  });

  it('returns 0 for identical timestamps', () => {
    const t = new Date('2026-08-01T09:00:00Z');
    expect(computeDurationMinutes(t, t)).toBe(0);
  });

  it('throws if the end is before the start', () => {
    const start = new Date('2026-08-01T09:00:00Z');
    const end = new Date('2026-08-01T08:00:00Z');
    expect(() => computeDurationMinutes(start, end)).toThrow(InvalidTimeEntryError);
  });
});
