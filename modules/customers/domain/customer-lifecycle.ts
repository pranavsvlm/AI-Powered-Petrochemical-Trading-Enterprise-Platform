export type CustomerStatus =
  'PROSPECT' | 'QUALIFIED_LEAD' | 'ACTIVE' | 'PENDING_APPROVAL' | 'ARCHIVED';

/**
 * Doc 11's lifecycle is arrows-only (Prospect -> Qualified Lead -> Customer -> ...); this is
 * the concrete state machine ratified for Phase 4 — see docs/DOMAIN_MODEL_PHASE4.md.
 * PENDING_APPROVAL is reachable from QUALIFIED_LEAD or ACTIVE (re-approval) and resolves back
 * to ACTIVE on approval or QUALIFIED_LEAD on rejection, mirroring DocumentService's
 * reopen-on-reject pattern.
 */
const ALLOWED_TRANSITIONS: Record<CustomerStatus, CustomerStatus[]> = {
  PROSPECT: ['QUALIFIED_LEAD', 'ACTIVE', 'ARCHIVED'],
  QUALIFIED_LEAD: ['ACTIVE', 'PENDING_APPROVAL', 'ARCHIVED'],
  ACTIVE: ['PENDING_APPROVAL', 'ARCHIVED'],
  PENDING_APPROVAL: ['ACTIVE', 'QUALIFIED_LEAD', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionCustomer(from: CustomerStatus, to: CustomerStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertCustomerTransition(from: CustomerStatus, to: CustomerStatus): void {
  if (!canTransitionCustomer(from, to)) {
    throw new Error(`Cannot transition customer from ${from} to ${to}.`);
  }
}
