export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

/** ASSET/EXPENSE carry a natural debit balance; LIABILITY/EQUITY/REVENUE carry a natural credit balance. */
const DEBIT_NORMAL_TYPES: AccountType[] = ['ASSET', 'EXPENSE'];

export interface TrialBalanceAccountRow {
  accountId: string;
  accountCode: string;
  name: string;
  accountType: AccountType;
  debitTotal: number;
  creditTotal: number;
  /** Signed per the account's normal side — positive means "as expected" for that type. */
  balance: number;
}

export interface TrialBalanceReport {
  rows: TrialBalanceAccountRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

/** A pure, computed read-side report over ChartOfAccount + JournalLine — never itself stored. */
export function aggregateTrialBalance(
  accounts: Array<{ id: string; accountCode: string; name: string; accountType: AccountType }>,
  lines: Array<{ accountId: string; debit: number; credit: number }>,
): TrialBalanceReport {
  const rows: TrialBalanceAccountRow[] = accounts.map((account) => {
    const accountLines = lines.filter((l) => l.accountId === account.id);
    const debitTotal = accountLines.reduce((sum, l) => sum + l.debit, 0);
    const creditTotal = accountLines.reduce((sum, l) => sum + l.credit, 0);
    const isDebitNormal = DEBIT_NORMAL_TYPES.includes(account.accountType);
    const balance = isDebitNormal ? debitTotal - creditTotal : creditTotal - debitTotal;
    return {
      accountId: account.id,
      accountCode: account.accountCode,
      name: account.name,
      accountType: account.accountType,
      debitTotal,
      creditTotal,
      balance,
    };
  });

  const totalDebits = rows.reduce((sum, r) => sum + r.debitTotal, 0);
  const totalCredits = rows.reduce((sum, r) => sum + r.creditTotal, 0);
  return {
    rows,
    totalDebits,
    totalCredits,
    isBalanced: Math.round(totalDebits * 100) === Math.round(totalCredits * 100),
  };
}
