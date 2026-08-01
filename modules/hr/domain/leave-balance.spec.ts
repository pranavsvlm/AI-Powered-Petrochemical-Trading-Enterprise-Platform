import { computeDaySpan, computeLeaveBalance } from './leave-balance';

describe('computeDaySpan', () => {
  it('counts a single day as 1, inclusive of both endpoints', () => {
    const day = new Date('2026-06-01');
    expect(computeDaySpan(day, day)).toBe(1);
  });

  it('counts a 5-day range inclusively', () => {
    expect(computeDaySpan(new Date('2026-06-01'), new Date('2026-06-05'))).toBe(5);
  });
});

describe('computeLeaveBalance', () => {
  it('subtracts the summed day-span of approved requests from the annual allotment', () => {
    const balance = computeLeaveBalance(20, [
      { startDate: new Date('2026-01-05'), endDate: new Date('2026-01-09') }, // 5 days
      { startDate: new Date('2026-03-10'), endDate: new Date('2026-03-10') }, // 1 day
    ]);
    expect(balance).toBe(14);
  });

  it('returns the full allotment when nothing has been approved yet', () => {
    expect(computeLeaveBalance(20, [])).toBe(20);
  });

  it('can go negative if more was approved than allotted (a real, visible signal, not clamped)', () => {
    const balance = computeLeaveBalance(5, [
      { startDate: new Date('2026-01-01'), endDate: new Date('2026-01-10') }, // 10 days
    ]);
    expect(balance).toBe(-5);
  });
});
