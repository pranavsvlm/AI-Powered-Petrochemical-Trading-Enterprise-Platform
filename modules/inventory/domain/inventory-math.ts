/** Stock available to reserve — never negative in practice, since reservations are gated by this. */
export function availableQuantity(quantityOnHand: number, quantityReserved: number): number {
  return quantityOnHand - quantityReserved;
}

export function hasSufficientStock(
  quantityOnHand: number,
  quantityReserved: number,
  requested: number,
): boolean {
  return availableQuantity(quantityOnHand, quantityReserved) >= requested;
}
