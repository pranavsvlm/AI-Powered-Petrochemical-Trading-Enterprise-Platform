import { assertJournalBalances, isJournalBalanced } from './journal-balance';

describe('journal-balance', () => {
  it('is balanced when sum(debit) equals sum(credit)', () => {
    expect(
      isJournalBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 100 },
      ]),
    ).toBe(true);
  });

  it('is unbalanced when totals differ', () => {
    expect(
      isJournalBalanced([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 90 },
      ]),
    ).toBe(false);
  });

  it('handles the classic 0.1 + 0.2 floating-point case as balanced', () => {
    expect(
      isJournalBalanced([
        { debit: 0.1, credit: 0 },
        { debit: 0.2, credit: 0 },
        { debit: 0, credit: 0.3 },
      ]),
    ).toBe(true);
  });

  it('assertJournalBalances throws on an unbalanced set of lines', () => {
    expect(() =>
      assertJournalBalances([
        { debit: 50, credit: 0 },
        { debit: 0, credit: 40 },
      ]),
    ).toThrow('Journal lines are not balanced');
  });

  it('assertJournalBalances throws on an empty journal', () => {
    expect(() => assertJournalBalances([])).toThrow('A journal must have at least one line.');
  });

  it('assertJournalBalances does not throw on balanced lines', () => {
    expect(() =>
      assertJournalBalances([
        { debit: 250.5, credit: 0 },
        { debit: 0, credit: 250.5 },
      ]),
    ).not.toThrow();
  });
});
