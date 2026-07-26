export type StockReservationStatus = 'ACTIVE' | 'RELEASED' | 'COMMITTED';

/**
 * A reservation is created ACTIVE by the atomic reserve step and terminates exactly once —
 * either RELEASED (order cancelled/held before confirmation) or COMMITTED (order confirmed,
 * stock permanently dispatched). See docs/DOMAIN_MODEL_PHASE5.md.
 */
const ALLOWED_TRANSITIONS: Record<StockReservationStatus, StockReservationStatus[]> = {
  ACTIVE: ['RELEASED', 'COMMITTED'],
  RELEASED: [],
  COMMITTED: [],
};

export function canTransitionReservation(
  from: StockReservationStatus,
  to: StockReservationStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertReservationTransition(
  from: StockReservationStatus,
  to: StockReservationStatus,
): void {
  if (!canTransitionReservation(from, to)) {
    throw new Error(`Cannot transition stock reservation from ${from} to ${to}.`);
  }
}
