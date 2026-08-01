export interface TrendPoint {
  /** Sortable period label, e.g. "2026-06" — not parsed, just carried through for context. */
  period: string;
  value: number;
}

export interface SalesForecastResult {
  projectedValue: number;
  basisPeriods: number;
}

export class InsufficientForecastDataError extends Error {
  constructor(pointCount: number) {
    super(`Need at least 2 trailing periods to project a trend, got ${pointCount}.`);
    this.name = 'InsufficientForecastDataError';
  }
}

/**
 * Real linear-regression projection over trailing periods (ordinary least squares, x = period
 * index) — deterministic math, not an AI guess. See docs/DOMAIN_MODEL_PHASE7.md, Analytics
 * section: this platform's AI narrates over real numbers, it never invents them. Clamped to
 * zero since projected revenue can't legitimately go negative.
 */
export function projectNextPeriod(points: TrendPoint[]): SalesForecastResult {
  if (points.length < 2) {
    throw new InsufficientForecastDataError(points.length);
  }

  const n = points.length;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.value);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    numerator += (x - xMean) * (y - yMean);
    denominator += (x - xMean) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = yMean - slope * xMean;

  const projectedValue = Math.max(0, slope * n + intercept);
  return { projectedValue, basisPeriods: n };
}
