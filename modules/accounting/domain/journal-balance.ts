export interface JournalLineAmounts {
  debit: number;
  credit: number;
}

/** Rounds to cents before comparing — avoids float artifacts like 0.1 + 0.2 !== 0.3. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function isJournalBalanced(lines: JournalLineAmounts[]): boolean {
  const totalDebitCents = lines.reduce((sum, l) => sum + toCents(l.debit), 0);
  const totalCreditCents = lines.reduce((sum, l) => sum + toCents(l.credit), 0);
  return totalDebitCents === totalCreditCents;
}

/** The double-entry invariant, enforced before any Journal row is ever created. */
export function assertJournalBalances(lines: JournalLineAmounts[]): void {
  if (lines.length === 0) {
    throw new Error('A journal must have at least one line.');
  }
  if (!isJournalBalanced(lines)) {
    throw new Error('Journal lines are not balanced: sum(debit) must equal sum(credit).');
  }
}
