import {
  assertPurchaseOrderTransition,
  canTransitionPurchaseOrder,
} from './purchase-order-lifecycle';

describe('purchase-order-lifecycle', () => {
  it('allows the happy path DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT', () => {
    expect(canTransitionPurchaseOrder('DRAFT', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransitionPurchaseOrder('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionPurchaseOrder('APPROVED', 'SENT')).toBe(true);
  });

  it('allows PENDING_APPROVAL -> DRAFT on rejection', () => {
    expect(canTransitionPurchaseOrder('PENDING_APPROVAL', 'DRAFT')).toBe(true);
  });

  it('allows SENT -> PARTIALLY_RECEIVED -> RECEIVED -> CLOSED', () => {
    expect(canTransitionPurchaseOrder('SENT', 'PARTIALLY_RECEIVED')).toBe(true);
    expect(canTransitionPurchaseOrder('PARTIALLY_RECEIVED', 'RECEIVED')).toBe(true);
    expect(canTransitionPurchaseOrder('RECEIVED', 'CLOSED')).toBe(true);
  });

  it('rejects transitions out of terminal states', () => {
    expect(canTransitionPurchaseOrder('CLOSED', 'SENT')).toBe(false);
    expect(canTransitionPurchaseOrder('CANCELLED', 'DRAFT')).toBe(false);
  });

  it('throws with a descriptive message on an illegal transition', () => {
    expect(() => assertPurchaseOrderTransition('DRAFT', 'SENT')).toThrow(
      'Cannot transition purchase order from DRAFT to SENT.',
    );
  });
});
