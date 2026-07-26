import { aggregateTrialBalance } from './trial-balance';

const ACCOUNTS = [
  { id: 'cash', accountCode: '1000', name: 'Cash', accountType: 'ASSET' as const },
  { id: 'ar', accountCode: '1100', name: 'Accounts Receivable', accountType: 'ASSET' as const },
  { id: 'revenue', accountCode: '4000', name: 'Sales Revenue', accountType: 'REVENUE' as const },
];

describe('aggregateTrialBalance', () => {
  it('computes debit-normal balances for ASSET accounts', () => {
    const report = aggregateTrialBalance(ACCOUNTS, [
      { accountId: 'cash', debit: 1000, credit: 200 },
    ]);
    const cashRow = report.rows.find((r) => r.accountId === 'cash')!;
    expect(cashRow.balance).toBe(800);
  });

  it('computes credit-normal balances for REVENUE accounts', () => {
    const report = aggregateTrialBalance(ACCOUNTS, [
      { accountId: 'revenue', debit: 0, credit: 5000 },
    ]);
    const revenueRow = report.rows.find((r) => r.accountId === 'revenue')!;
    expect(revenueRow.balance).toBe(5000);
  });

  it('reports isBalanced true when total debits equal total credits', () => {
    const report = aggregateTrialBalance(ACCOUNTS, [
      { accountId: 'ar', debit: 5000, credit: 0 },
      { accountId: 'revenue', debit: 0, credit: 5000 },
    ]);
    expect(report.isBalanced).toBe(true);
    expect(report.totalDebits).toBe(5000);
    expect(report.totalCredits).toBe(5000);
  });

  it('reports isBalanced false when totals differ', () => {
    const report = aggregateTrialBalance(ACCOUNTS, [
      { accountId: 'ar', debit: 5000, credit: 0 },
      { accountId: 'revenue', debit: 0, credit: 4000 },
    ]);
    expect(report.isBalanced).toBe(false);
  });

  it('includes accounts with no lines at zero', () => {
    const report = aggregateTrialBalance(ACCOUNTS, []);
    expect(report.rows).toHaveLength(3);
    expect(report.rows.every((r) => r.balance === 0)).toBe(true);
  });
});
