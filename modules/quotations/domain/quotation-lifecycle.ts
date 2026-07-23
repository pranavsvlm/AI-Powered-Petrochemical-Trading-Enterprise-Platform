export type QuotationStatus =
  'DRAFT' | 'SENT' | 'NEGOTIATING' | 'PENDING_APPROVAL' | 'APPROVED' | 'CONVERTED' | 'CANCELLED';

/**
 * Doc 13's lifecycle is arrows-only ("... -> Quotation -> Negotiation -> Approval (if
 * required) -> Sales Order -> ..."); this is the ratified state machine — see
 * docs/DOMAIN_MODEL_PHASE4.md. The one explicit approval gate sits at
 * NEGOTIATING/SENT -> PENDING_APPROVAL. There is no REJECTED status here: rejection is
 * recorded on ApprovalRequest.status, and QuotationService.decideApproval reopens a rejected
 * quotation straight to NEGOTIATING — mirroring DocumentService.decideApproval's
 * reopen-to-DRAFT, and avoiding a second place that tracks the approval outcome.
 */
const ALLOWED_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['NEGOTIATING', 'PENDING_APPROVAL', 'CANCELLED'],
  NEGOTIATING: ['SENT', 'PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'NEGOTIATING', 'CANCELLED'],
  APPROVED: ['CONVERTED'],
  CONVERTED: [],
  CANCELLED: [],
};

export function canTransitionQuotation(from: QuotationStatus, to: QuotationStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertQuotationTransition(from: QuotationStatus, to: QuotationStatus): void {
  if (!canTransitionQuotation(from, to)) {
    throw new Error(`Cannot transition quotation from ${from} to ${to}.`);
  }
}
