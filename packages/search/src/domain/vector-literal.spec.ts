import { toVectorLiteral } from './vector-literal';

describe('toVectorLiteral', () => {
  it('formats a numeric array as a bracketed comma-separated pgvector literal', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });

  it('formats an empty array as empty brackets', () => {
    expect(toVectorLiteral([])).toBe('[]');
  });
});
