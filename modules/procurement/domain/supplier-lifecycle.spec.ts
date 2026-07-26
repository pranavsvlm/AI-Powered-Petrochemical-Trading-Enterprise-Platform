import { assertSupplierTransition, canTransitionSupplier } from './supplier-lifecycle';

describe('supplier-lifecycle', () => {
  it('allows PROSPECT -> ACTIVE', () => {
    expect(canTransitionSupplier('PROSPECT', 'ACTIVE')).toBe(true);
  });

  it('allows ACTIVE -> SUSPENDED and back', () => {
    expect(canTransitionSupplier('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(canTransitionSupplier('SUSPENDED', 'ACTIVE')).toBe(true);
  });

  it('rejects transitions out of ARCHIVED', () => {
    expect(canTransitionSupplier('ARCHIVED', 'ACTIVE')).toBe(false);
  });

  it('throws with a descriptive message on an illegal transition', () => {
    expect(() => assertSupplierTransition('ARCHIVED', 'PROSPECT')).toThrow(
      'Cannot transition supplier from ARCHIVED to PROSPECT.',
    );
  });
});
