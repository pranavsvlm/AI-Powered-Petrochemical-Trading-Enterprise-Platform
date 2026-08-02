import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface CreatedApiKeyResponse extends ApiKeySummary {
  /** The raw secret — present only in this one response, right after creation. */
  key: string;
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

export function useApiKeys() {
  const api = useApiClient();
  return useAsync<ApiKeySummary[]>(() => api.get('/api-keys'), []);
}

export function useCreateApiKey() {
  const api = useApiClient();
  return useCallback(
    (name: string) => api.post<CreatedApiKeyResponse>('/api-keys', { name }),
    [api],
  );
}

export function useRevokeApiKey() {
  const api = useApiClient();
  return useCallback((id: string) => api.del<ApiKeySummary>(`/api-keys/${id}`), [api]);
}
