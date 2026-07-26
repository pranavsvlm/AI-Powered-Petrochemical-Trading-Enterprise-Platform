import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface ChartOfAccount {
  id: string;
  accountCode: string;
  name: string;
  accountType: string;
  isActive: boolean;
}

function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    setError(null);
    load()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, deps);

  useEffect(() => refetch(), [refetch]);

  return { data, loading, error, refetch };
}

export function useChartOfAccounts() {
  const api = useApiClient();
  return useAsync<ChartOfAccount[]>(() => api.get('/chart-of-accounts'), []);
}

export function useSeedDefaultChart() {
  const api = useApiClient();
  return useCallback(
    () => api.post<ChartOfAccount[]>('/chart-of-accounts/seed-defaults', {}),
    [api],
  );
}
