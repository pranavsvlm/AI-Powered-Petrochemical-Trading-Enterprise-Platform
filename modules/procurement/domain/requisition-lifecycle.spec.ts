import { assertRequisitionTransition, canTransitionRequisition } from './requisition-lifecycle';

describe('requisition-lifecycle', () => {
  it('allows DRAFT -> SUBMITTED', () => {
    expect(canTransitionRequisition('DRAFT', 'SUBMITTED')).toBe(true);
  });

  it('allows SUBMITTED -> APPROVED or REJECTED', () => {
    expect(canTransitionRequisition('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canTransitionRequisition('SUBMITTED', 'REJECTED')).toBe(true);
  });

  it('allows REJECTED -> DRAFT for revision', () => {
    expect(canTransitionRequisition('REJECTED', 'DRAFT')).toBe(true);
  });

  it('allows APPROVED -> CONVERTED', () => {
    expect(canTransitionRequisition('APPROVED', 'CONVERTED')).toBe(true);
  });

  it('rejects transitions out of terminal states', () => {
    expect(canTransitionRequisition('CONVERTED', 'CANCELLED')).toBe(false);
    expect(canTransitionRequisition('CANCELLED', 'DRAFT')).toBe(false);
  });

  it('throws with a descriptive message on an illegal transition', () => {
    expect(() => assertRequisitionTransition('DRAFT', 'APPROVED')).toThrow(
      'Cannot transition purchase requisition from DRAFT to APPROVED.',
    );
  });
});
