import {
  computeOvertimeHours,
  computeWorkedHours,
  InvalidAttendanceRangeError,
  parseShiftHours,
} from './attendance-hours';

describe('computeWorkedHours', () => {
  it('computes hours between clock-in and clock-out', () => {
    const hours = computeWorkedHours(
      new Date('2026-06-01T09:00:00Z'),
      new Date('2026-06-01T17:30:00Z'),
    );
    expect(hours).toBeCloseTo(8.5);
  });

  it('throws for a clock-out before clock-in', () => {
    expect(() =>
      computeWorkedHours(new Date('2026-06-01T17:00:00Z'), new Date('2026-06-01T09:00:00Z')),
    ).toThrow(InvalidAttendanceRangeError);
  });
});

describe('computeOvertimeHours', () => {
  it('returns the excess over the shift length', () => {
    expect(computeOvertimeHours(9.5, 8)).toBeCloseTo(1.5);
  });

  it('never goes negative when worked hours are under the shift length', () => {
    expect(computeOvertimeHours(6, 8)).toBe(0);
  });
});

describe('parseShiftHours', () => {
  it('computes a same-day shift length', () => {
    expect(parseShiftHours('09:00', '17:00')).toBe(8);
  });

  it('handles an overnight shift crossing midnight', () => {
    expect(parseShiftHours('22:00', '06:00')).toBe(8);
  });
});
