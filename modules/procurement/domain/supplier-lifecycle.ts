export type SupplierStatus = 'PROSPECT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

/**
 * Simpler than Customer's — doc 17 has no supplier-onboarding approval gate in Phase 5's scope
 * (only Requisition/PurchaseOrder are approval-gated). See docs/DOMAIN_MODEL_PHASE5.md.
 */
const ALLOWED_TRANSITIONS: Record<SupplierStatus, SupplierStatus[]> = {
  PROSPECT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionSupplier(from: SupplierStatus, to: SupplierStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertSupplierTransition(from: SupplierStatus, to: SupplierStatus): void {
  if (!canTransitionSupplier(from, to)) {
    throw new Error(`Cannot transition supplier from ${from} to ${to}.`);
  }
}
