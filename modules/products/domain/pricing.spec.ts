import { computeMargin, resolvePrice, type PriceListEntry } from './pricing';

function entry(overrides: Partial<PriceListEntry>): PriceListEntry {
  return {
    id: 'entry-1',
    productId: 'product-1',
    customerId: null,
    currency: 'USD',
    uom: 'MT',
    minQuantity: 0,
    unitPrice: 100,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

describe('resolvePrice', () => {
  it('returns null when no price list matches the currency', () => {
    const result = resolvePrice([entry({ currency: 'EUR' })], { quantity: 10, currency: 'USD' });
    expect(result).toBeNull();
  });

  it('prefers a customer-specific entry over a general one', () => {
    const general = entry({ id: 'general', unitPrice: 100 });
    const specific = entry({ id: 'specific', customerId: 'cust-1', unitPrice: 90 });
    const result = resolvePrice([general, specific], {
      customerId: 'cust-1',
      quantity: 10,
      currency: 'USD',
    });
    expect(result?.entry.id).toBe('specific');
    expect(result?.unitPrice).toBe(90);
  });

  it('picks the highest qualifying quantity-break tier', () => {
    const tier0 = entry({ id: 'tier-0', minQuantity: 0, unitPrice: 100 });
    const tier100 = entry({ id: 'tier-100', minQuantity: 100, unitPrice: 80 });
    const tier500 = entry({ id: 'tier-500', minQuantity: 500, unitPrice: 60 });
    const result = resolvePrice([tier0, tier100, tier500], { quantity: 200, currency: 'USD' });
    expect(result?.entry.id).toBe('tier-100');
  });

  it('excludes entries outside their validity window', () => {
    const expired = entry({
      id: 'expired',
      validTo: new Date('2020-01-01'),
    });
    const result = resolvePrice([expired], {
      quantity: 10,
      currency: 'USD',
      asOf: new Date('2026-01-01'),
    });
    expect(result).toBeNull();
  });
});

describe('computeMargin', () => {
  it('computes margin percent on the sale price', () => {
    expect(computeMargin(100, 80)).toBeCloseTo(20);
  });

  it('returns null when standard cost is unknown', () => {
    expect(computeMargin(100, null)).toBeNull();
  });
});
