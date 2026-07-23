import { assertCustomerTransition, canTransitionCustomer } from './customer-lifecycle';

describe('canTransitionCustomer', () => {
  it('allows the prospect -> qualified lead -> active happy path', () => {
    expect(canTransitionCustomer('PROSPECT', 'QUALIFIED_LEAD')).toBe(true);
    expect(canTransitionCustomer('QUALIFIED_LEAD', 'ACTIVE')).toBe(true);
  });

  it('allows requesting approval from an active customer', () => {
    expect(canTransitionCustomer('ACTIVE', 'PENDING_APPROVAL')).toBe(true);
  });

  it('allows a rejected approval to reopen to qualified lead', () => {
    expect(canTransitionCustomer('PENDING_APPROVAL', 'QUALIFIED_LEAD')).toBe(true);
  });

  it('rejects transitions out of ARCHIVED', () => {
    expect(canTransitionCustomer('ARCHIVED', 'ACTIVE')).toBe(false);
  });

  it('rejects skipping straight from pending approval back to prospect', () => {
    expect(canTransitionCustomer('PENDING_APPROVAL', 'PROSPECT')).toBe(false);
  });
});

describe('assertCustomerTransition', () => {
  it('throws for a disallowed transition', () => {
    expect(() => assertCustomerTransition('ARCHIVED', 'ACTIVE')).toThrow();
  });

  it('does not throw for an allowed transition', () => {
    expect(() => assertCustomerTransition('PROSPECT', 'ACTIVE')).not.toThrow();
  });
});
