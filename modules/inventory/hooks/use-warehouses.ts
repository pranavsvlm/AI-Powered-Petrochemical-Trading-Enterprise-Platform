import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  branchId?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  country?: string | null;
  isDefault: boolean;
  status: string;
}

export interface CreateWarehouseInput {
  code: string;
  name: string;
  branchId?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
  isDefault?: boolean;
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

export function useWarehouses(status?: string) {
  const api = useApiClient();
  return useAsync<Warehouse[]>(() => api.get('/warehouses', { status }), [status]);
}

export function useWarehouse(id: string) {
  const api = useApiClient();
  return useAsync<Warehouse>(() => api.get(`/warehouses/${id}`), [id]);
}

export function useCreateWarehouse() {
  const api = useApiClient();
  return useCallback(
    (input: CreateWarehouseInput) => api.post<Warehouse>('/warehouses', input),
    [api],
  );
}
