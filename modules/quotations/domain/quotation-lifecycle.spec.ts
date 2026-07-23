import { assertQuotationTransition, canTransitionQuotation } from './quotation-lifecycle';

describe('canTransitionQuotation', () => {
  it('allows the draft -> sent -> negotiating -> pending approval -> approved -> converted path', () => {
    expect(canTransitionQuotation('DRAFT', 'SENT')).toBe(true);
    expect(canTransitionQuotation('SENT', 'NEGOTIATING')).toBe(true);
    expect(canTransitionQuotation('NEGOTIATING', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransitionQuotation('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionQuotation('APPROVED', 'CONVERTED')).toBe(true);
  });

  it('allows sending straight to approval without negotiation', () => {
    expect(canTransitionQuotation('SENT', 'PENDING_APPROVAL')).toBe(true);
  });

  it('reopens a rejected quotation straight to negotiating (no separate REJECTED status)', () => {
    expect(canTransitionQuotation('PENDING_APPROVAL', 'NEGOTIATING')).toBe(true);
  });

  it('rejects skipping approval to go straight from negotiating to converted', () => {
    expect(canTransitionQuotation('NEGOTIATING', 'CONVERTED')).toBe(false);
  });

  it('rejects transitions out of terminal states', () => {
    expect(canTransitionQuotation('CONVERTED', 'DRAFT')).toBe(false);
    expect(canTransitionQuotation('CANCELLED', 'DRAFT')).toBe(false);
  });
});

describe('assertQuotationTransition', () => {
  it('throws for a disallowed transition', () => {
    expect(() => assertQuotationTransition('CONVERTED', 'SENT')).toThrow();
  });
});
