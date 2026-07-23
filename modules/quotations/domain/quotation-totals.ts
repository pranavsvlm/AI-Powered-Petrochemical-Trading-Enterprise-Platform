export interface QuotationLineItemInput {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
}

export interface VersionTotals {
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
}

export function computeLineTotal(item: QuotationLineItemInput): number {
  const discount = item.discountPercent ?? 0;
  return item.quantity * item.unitPrice * (1 - discount / 100);
}

export function computeVersionTotals(items: QuotationLineItemInput[]): VersionTotals {
  let subtotal = 0;
  let discountAmount = 0;
  for (const item of items) {
    const gross = item.quantity * item.unitPrice;
    subtotal += gross;
    discountAmount += gross * ((item.discountPercent ?? 0) / 100);
  }
  return { subtotal, discountAmount, totalAmount: subtotal - discountAmount };
}

/** Margin as a percentage of the quoted total: (totalAmount - totalCost) / totalAmount * 100. */
export function computeMarginPercent(
  totalAmount: number,
  totalCost: number | null | undefined,
): number | null {
  if (totalCost == null || totalAmount === 0) return null;
  return ((totalAmount - totalCost) / totalAmount) * 100;
}

/**
 * Quotation-level margin as the line-total-weighted average of each resolved line's own
 * margin (from ProductService.getEffectivePrice) — avoids re-deriving per-product standard
 * cost here, which would duplicate pricing's own domain logic.
 */
export function computeWeightedMarginPercent(
  lines: Array<{ lineTotal: number; marginPercent: number | null }>,
): number | null {
  const known = lines.filter(
    (l): l is { lineTotal: number; marginPercent: number } => l.marginPercent != null,
  );
  const totalWeight = known.reduce((sum, l) => sum + l.lineTotal, 0);
  if (known.length === 0 || totalWeight === 0) return null;
  const weighted = known.reduce((sum, l) => sum + l.lineTotal * l.marginPercent, 0);
  return weighted / totalWeight;
}
