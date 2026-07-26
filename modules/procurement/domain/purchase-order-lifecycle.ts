export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED';

/**
 * Doc 17 names "creation, approval, sending, tracking, receiving" with no concrete state
 * machine; this is the ratified one — see docs/DOMAIN_MODEL_PHASE5.md. PENDING_APPROVAL
 * reopens to DRAFT on rejection, mirroring the requisition and document reopen-on-reject
 * precedent. PARTIALLY_RECEIVED/RECEIVED are driven by po-receipt-status.ts, not chosen
 * directly by callers.
 */
const ALLOWED_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SENT', 'CANCELLED'],
  SENT: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED', 'CANCELLED'],
  RECEIVED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionPurchaseOrder(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPurchaseOrderTransition(
  from: PurchaseOrderStatus,
  to: PurchaseOrderStatus,
): void {
  if (!canTransitionPurchaseOrder(from, to)) {
    throw new Error(`Cannot transition purchase order from ${from} to ${to}.`);
  }
}
