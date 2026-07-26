/** Derives PARTIALLY_RECEIVED / RECEIVED from line-item received quantities — mirrors orders' computeAggregateFulfillmentStatus. */
export function computeAggregateReceiptStatus(
  lineItems: Array<{ quantity: number; receivedQuantity: number }>,
): 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' {
  if (lineItems.length === 0) return 'SENT';
  const totalQuantity = lineItems.reduce((sum, l) => sum + l.quantity, 0);
  const totalReceived = lineItems.reduce(
    (sum, l) => sum + Math.min(l.receivedQuantity, l.quantity),
    0,
  );
  if (totalReceived <= 0) return 'SENT';
  if (totalReceived >= totalQuantity) return 'RECEIVED';
  return 'PARTIALLY_RECEIVED';
}
