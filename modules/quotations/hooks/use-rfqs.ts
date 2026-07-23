import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface RfqLineItem {
  id: string;
  productId: string;
  quantity: string;
  uom: string;
  targetPrice?: string | null;
}

export interface Rfq {
  id: string;
  rfqNumber: string;
  customerId: string;
  currency: string;
  status: string;
  createdAt: string;
  lineItems: RfqLineItem[];
}

export interface CreateRfqLineInput {
  productId: string;
  quantity: number;
  uom: string;
  targetPrice?: number;
}

export interface CreateRfqInput {
  rfqNumber: string;
  customerId: string;
  currency: string;
  notes?: string;
  lineItems: CreateRfqLineInput[];
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

export function useRfqs(status?: string) {
  const api = useApiClient();
  return useAsync<Rfq[]>(() => api.get('/rfqs', { status }), [status]);
}

export function useRfq(id: string) {
  const api = useApiClient();
  return useAsync<Rfq>(() => api.get(`/rfqs/${id}`), [id]);
}

export function useCreateRfq() {
  const api = useApiClient();
  return useCallback((input: CreateRfqInput) => api.post<Rfq>('/rfqs', input), [api]);
}

export function useSubmitRfq() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<Rfq>(`/rfqs/${id}/submit`, {}), [api]);
}
