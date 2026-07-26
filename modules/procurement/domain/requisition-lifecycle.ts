export type PurchaseRequisitionStatus =
  'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONVERTED' | 'CANCELLED';

/**
 * Doc 17 names "requisition, approval, PO generation" with no concrete state machine; this is
 * the ratified one — see docs/DOMAIN_MODEL_PHASE5.md. REJECTED reopens to DRAFT for revision
 * and resubmission, mirroring DocumentService's reopen-on-reject precedent.
 */
const ALLOWED_TRANSITIONS: Record<PurchaseRequisitionStatus, PurchaseRequisitionStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['CONVERTED', 'CANCELLED'],
  REJECTED: ['DRAFT', 'CANCELLED'],
  CONVERTED: [],
  CANCELLED: [],
};

export function canTransitionRequisition(
  from: PurchaseRequisitionStatus,
  to: PurchaseRequisitionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertRequisitionTransition(
  from: PurchaseRequisitionStatus,
  to: PurchaseRequisitionStatus,
): void {
  if (!canTransitionRequisition(from, to)) {
    throw new Error(`Cannot transition purchase requisition from ${from} to ${to}.`);
  }
}
