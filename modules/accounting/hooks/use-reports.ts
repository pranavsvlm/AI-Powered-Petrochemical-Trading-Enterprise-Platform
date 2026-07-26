import { useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  name: string;
  accountType: string;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

export interface TrialBalanceReport {
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

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

function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    load()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, deps);

  return { data, loading, error };
}

export function useTrialBalance() {
  const api = useApiClient();
  return useAsync<TrialBalanceReport>(() => api.get('/reports/trial-balance'), []);
}

export function useProfitAndLoss() {
  const api = useApiClient();
  return useAsync<ProfitAndLossReport>(() => api.get('/reports/profit-and-loss'), []);
}
