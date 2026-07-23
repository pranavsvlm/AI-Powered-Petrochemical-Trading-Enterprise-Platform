import { assertRfqTransition, canTransitionRfq } from './rfq-lifecycle';

describe('canTransitionRfq', () => {
  it('allows the draft -> submitted -> quoted -> closed happy path', () => {
    expect(canTransitionRfq('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransitionRfq('SUBMITTED', 'QUOTED')).toBe(true);
    expect(canTransitionRfq('QUOTED', 'CLOSED')).toBe(true);
  });

  it('allows cancelling from draft or submitted', () => {
    expect(canTransitionRfq('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionRfq('SUBMITTED', 'CANCELLED')).toBe(true);
  });

  it('rejects cancelling an already-quoted RFQ', () => {
    expect(canTransitionRfq('QUOTED', 'CANCELLED')).toBe(false);
  });

  it('rejects transitions out of terminal states', () => {
    expect(canTransitionRfq('CLOSED', 'SUBMITTED')).toBe(false);
    expect(canTransitionRfq('CANCELLED', 'SUBMITTED')).toBe(false);
  });
});

describe('assertRfqTransition', () => {
  it('throws for a disallowed transition', () => {
    expect(() => assertRfqTransition('CLOSED', 'DRAFT')).toThrow();
  });
});
