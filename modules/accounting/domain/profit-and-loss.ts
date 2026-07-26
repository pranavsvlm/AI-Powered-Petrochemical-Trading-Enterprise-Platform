import type { TrialBalanceReport } from './trial-balance';

export interface ProfitAndLossLine {
  accountId: string;
  accountCode: string;
  name: string;
  amount: number;
}

export interface ProfitAndLossReport {
  revenue: number;
  expenses: number;
  netIncome: number;
  revenueLines: ProfitAndLossLine[];
  expenseLines: ProfitAndLossLine[];
}

/** A pure, computed read-side report composed from an already-aggregated TrialBalanceReport. */
export function computeProfitAndLoss(trialBalance: TrialBalanceReport): ProfitAndLossReport {
  const revenueLines = trialBalance.rows
    .filter((r) => r.accountType === 'REVENUE')
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      name: r.name,
      amount: r.balance,
    }));
  const expenseLines = trialBalance.rows
    .filter((r) => r.accountType === 'EXPENSE')
    .map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      name: r.name,
      amount: r.balance,
    }));

  const revenue = revenueLines.reduce((sum, l) => sum + l.amount, 0);
  const expenses = expenseLines.reduce((sum, l) => sum + l.amount, 0);

  return { revenue, expenses, netIncome: revenue - expenses, revenueLines, expenseLines };
}
