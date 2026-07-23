import {
  computeLineTotal,
  computeMarginPercent,
  computeVersionTotals,
  computeWeightedMarginPercent,
} from './quotation-totals';

describe('computeLineTotal', () => {
  it('computes quantity * unitPrice with no discount', () => {
    expect(computeLineTotal({ quantity: 10, unitPrice: 100 })).toBe(1000);
  });

  it('applies a percentage discount', () => {
    expect(computeLineTotal({ quantity: 10, unitPrice: 100, discountPercent: 10 })).toBe(900);
  });
});

describe('computeVersionTotals', () => {
  it('sums subtotal, discount, and total across line items', () => {
    const totals = computeVersionTotals([
      { quantity: 10, unitPrice: 100 },
      { quantity: 5, unitPrice: 200, discountPercent: 10 },
    ]);
    expect(totals.subtotal).toBe(1000 + 1000);
    expect(totals.discountAmount).toBe(100);
    expect(totals.totalAmount).toBe(1900);
  });

  it('returns zeroes for an empty line item list', () => {
    expect(computeVersionTotals([])).toEqual({ subtotal: 0, discountAmount: 0, totalAmount: 0 });
  });
});

describe('computeMarginPercent', () => {
  it('computes margin percent on the quoted total', () => {
    expect(computeMarginPercent(1000, 800)).toBeCloseTo(20);
  });

  it('returns null when cost is unknown', () => {
    expect(computeMarginPercent(1000, null)).toBeNull();
  });
});

describe('computeWeightedMarginPercent', () => {
  it('weights each line margin by its line total', () => {
    const result = computeWeightedMarginPercent([
      { lineTotal: 100, marginPercent: 10 },
      { lineTotal: 300, marginPercent: 30 },
    ]);
    expect(result).toBeCloseTo((100 * 10 + 300 * 30) / 400);
  });

  it('ignores lines with an unknown margin', () => {
    const result = computeWeightedMarginPercent([
      { lineTotal: 100, marginPercent: null },
      { lineTotal: 300, marginPercent: 20 },
    ]);
    expect(result).toBeCloseTo(20);
  });

  it('returns null when no line has a known margin', () => {
    expect(computeWeightedMarginPercent([{ lineTotal: 100, marginPercent: null }])).toBeNull();
  });
});
