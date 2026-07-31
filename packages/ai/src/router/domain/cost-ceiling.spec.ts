import { evaluateCostCeiling } from './cost-ceiling';

describe('evaluateCostCeiling', () => {
  it('allows any spend when no ceiling is configured', () => {
    expect(evaluateCostCeiling(1000, 500, null).allowed).toBe(true);
  });

  it('allows a call that stays within the ceiling', () => {
    expect(evaluateCostCeiling(1, 0.5, 2).allowed).toBe(true);
  });

  it('allows a call that lands exactly on the ceiling', () => {
    expect(evaluateCostCeiling(1, 1, 2).allowed).toBe(true);
  });

  it('blocks a call that would exceed the ceiling by any amount', () => {
    const result = evaluateCostCeiling(1.5, 0.51, 2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/exceed monthly ceiling/);
  });

  it('blocks even a zero-cost call once spend already exceeds the ceiling', () => {
    expect(evaluateCostCeiling(5, 0, 2).allowed).toBe(false);
  });
});
