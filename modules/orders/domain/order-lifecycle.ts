export type OrderStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'ON_HOLD'
  | 'CLOSED'
  | 'CANCELLED';

/**
 * Doc 13 names "confirmation, status tracking, partial fulfillment, backorders, amendments"
 * with no concrete state machine; this is the ratified one — see docs/DOMAIN_MODEL_PHASE4.md.
 * ON_HOLD is a manual flag (no Inventory module exists yet to drive automatic backorder
 * detection — deferred to Phase 5) and always releases back to CONFIRMED.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PARTIALLY_FULFILLED', 'FULFILLED', 'ON_HOLD', 'CANCELLED'],
  PARTIALLY_FULFILLED: ['FULFILLED', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['CONFIRMED', 'CANCELLED'],
  FULFILLED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Cannot transition order from ${from} to ${to}.`);
  }
}

/** Derives CONFIRMED / PARTIALLY_FULFILLED / FULFILLED from line-item fulfillment quantities. */
export function computeAggregateFulfillmentStatus(
  lineItems: Array<{ quantity: number; fulfilledQuantity: number }>,
): 'CONFIRMED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' {
  if (lineItems.length === 0) return 'CONFIRMED';
  const totalQuantity = lineItems.reduce((sum, l) => sum + l.quantity, 0);
  const totalFulfilled = lineItems.reduce(
    (sum, l) => sum + Math.min(l.fulfilledQuantity, l.quantity),
    0,
  );
  if (totalFulfilled <= 0) return 'CONFIRMED';
  if (totalFulfilled >= totalQuantity) return 'FULFILLED';
  return 'PARTIALLY_FULFILLED';
}
