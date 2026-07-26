import { aggregateTrialBalance } from './trial-balance';
import { computeProfitAndLoss } from './profit-and-loss';

const ACCOUNTS = [
  { id: 'revenue', accountCode: '4000', name: 'Sales Revenue', accountType: 'REVENUE' as const },
  { id: 'cogs', accountCode: '5000', name: 'Cost of Goods Sold', accountType: 'EXPENSE' as const },
  { id: 'cash', accountCode: '1000', name: 'Cash', accountType: 'ASSET' as const },
];

describe('computeProfitAndLoss', () => {
  it('nets revenue minus expenses into netIncome', () => {
    const trialBalance = aggregateTrialBalance(ACCOUNTS, [
      { accountId: 'revenue', debit: 0, credit: 10000 },
      { accountId: 'cogs', debit: 6000, credit: 0 },
    ]);
    const pnl = computeProfitAndLoss(trialBalance);
    expect(pnl.revenue).toBe(10000);
    expect(pnl.expenses).toBe(6000);
    expect(pnl.netIncome).toBe(4000);
  });

  it('excludes ASSET/LIABILITY/EQUITY accounts from the report', () => {
    const trialBalance = aggregateTrialBalance(ACCOUNTS, [
      { accountId: 'cash', debit: 10000, credit: 0 },
    ]);
    const pnl = computeProfitAndLoss(trialBalance);
    expect(pnl.revenue).toBe(0);
    expect(pnl.expenses).toBe(0);
    expect(pnl.revenueLines).toHaveLength(1);
    expect(pnl.expenseLines).toHaveLength(1);
  });

  it('can report a net loss', () => {
    const trialBalance = aggregateTrialBalance(ACCOUNTS, [
      { accountId: 'revenue', debit: 0, credit: 1000 },
      { accountId: 'cogs', debit: 1500, credit: 0 },
    ]);
    const pnl = computeProfitAndLoss(trialBalance);
    expect(pnl.netIncome).toBe(-500);
  });
});
