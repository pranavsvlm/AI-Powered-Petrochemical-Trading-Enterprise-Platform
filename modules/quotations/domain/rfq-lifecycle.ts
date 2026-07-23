export type RfqStatus = 'DRAFT' | 'SUBMITTED' | 'QUOTED' | 'CLOSED' | 'CANCELLED';

/** See docs/DOMAIN_MODEL_PHASE4.md — doc 13 gives no named RFQ states; this is the ratified machine. */
const ALLOWED_TRANSITIONS: Record<RfqStatus, RfqStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['QUOTED', 'CANCELLED'],
  QUOTED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionRfq(from: RfqStatus, to: RfqStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertRfqTransition(from: RfqStatus, to: RfqStatus): void {
  if (!canTransitionRfq(from, to)) {
    throw new Error(`Cannot transition RFQ from ${from} to ${to}.`);
  }
}
