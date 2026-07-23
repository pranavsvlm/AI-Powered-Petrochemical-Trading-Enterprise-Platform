export interface PriceListEntry {
  id: string;
  productId: string;
  customerId: string | null;
  currency: string;
  uom: string;
  minQuantity: number;
  unitPrice: number;
  validFrom: Date | null;
  validTo: Date | null;
}

export interface PriceResolutionQuery {
  customerId?: string;
  quantity: number;
  currency: string;
  asOf?: Date;
}

export interface ResolvedPrice {
  entry: PriceListEntry;
  unitPrice: number;
  currency: string;
  uom: string;
}

/**
 * Most-specific-match resolution over a product's price lists: customer-specific entries
 * beat general ones, and among equally-specific entries the highest qualifying quantity-break
 * (`minQuantity`) wins. See docs/DOMAIN_MODEL_PHASE4.md.
 */
export function resolvePrice(
  priceLists: PriceListEntry[],
  query: PriceResolutionQuery,
): ResolvedPrice | null {
  const asOf = query.asOf ?? new Date();
  const candidates = priceLists.filter(
    (p) =>
      p.currency === query.currency &&
      p.minQuantity <= query.quantity &&
      (p.validFrom == null || p.validFrom <= asOf) &&
      (p.validTo == null || p.validTo >= asOf) &&
      (p.customerId == null || p.customerId === query.customerId),
  );
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aSpecific = a.customerId != null ? 1 : 0;
    const bSpecific = b.customerId != null ? 1 : 0;
    if (aSpecific !== bSpecific) return bSpecific - aSpecific;
    return b.minQuantity - a.minQuantity;
  });
  const best = candidates[0];
  if (!best) return null;

  return { entry: best, unitPrice: best.unitPrice, currency: best.currency, uom: best.uom };
}

/** Margin as a percentage of the sale price: (unitPrice - standardCost) / unitPrice * 100. */
export function computeMargin(
  unitPrice: number,
  standardCost: number | null | undefined,
): number | null {
  if (standardCost == null || unitPrice === 0) return null;
  return ((unitPrice - standardCost) / unitPrice) * 100;
}
