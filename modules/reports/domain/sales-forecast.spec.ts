import { InsufficientForecastDataError, projectNextPeriod } from './sales-forecast';

describe('projectNextPeriod', () => {
  it('projects the next value along a perfect linear trend', () => {
    const result = projectNextPeriod([
      { period: '2026-01', value: 100 },
      { period: '2026-02', value: 200 },
      { period: '2026-03', value: 300 },
    ]);
    expect(result.projectedValue).toBeCloseTo(400);
    expect(result.basisPeriods).toBe(3);
  });

  it('projects a flat trend as flat', () => {
    const result = projectNextPeriod([
      { period: '2026-01', value: 500 },
      { period: '2026-02', value: 500 },
      { period: '2026-03', value: 500 },
    ]);
    expect(result.projectedValue).toBeCloseTo(500);
  });

  it('clamps a steep downward trend to zero rather than projecting negative revenue', () => {
    const result = projectNextPeriod([
      { period: '2026-01', value: 100 },
      { period: '2026-02', value: 50 },
      { period: '2026-03', value: 0 },
    ]);
    expect(result.projectedValue).toBe(0);
  });

  it('throws for fewer than 2 trailing periods', () => {
    expect(() => projectNextPeriod([{ period: '2026-01', value: 100 }])).toThrow(
      InsufficientForecastDataError,
    );
    expect(() => projectNextPeriod([])).toThrow(InsufficientForecastDataError);
  });
});
