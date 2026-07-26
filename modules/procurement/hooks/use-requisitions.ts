import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface RequisitionLineItem {
  id: string;
  productId: string;
  quantity: string;
  uom: string;
  estimatedUnitPrice?: string | null;
}

export interface Requisition {
  id: string;
  requisitionNumber: string;
  requestedByUserId: string;
  status: string;
  notes?: string | null;
  lineItems: RequisitionLineItem[];
}

export interface CreateRequisitionLineInput {
  productId: string;
  quantity: number;
  uom: string;
  estimatedUnitPrice?: number;
}

export interface CreateRequisitionInput {
  requisitionNumber: string;
  notes?: string;
  lineItems: CreateRequisitionLineInput[];
}

export interface ApprovalRequestSummary {
  id: string;
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

export function useRequisitions(status?: string) {
  const api = useApiClient();
  return useAsync<Requisition[]>(() => api.get('/requisitions', { status }), [status]);
}

export function useRequisition(id: string) {
  const api = useApiClient();
  return useAsync<Requisition>(() => api.get(`/requisitions/${id}`), [id]);
}

export function useCreateRequisition() {
  const api = useApiClient();
  return useCallback(
    (input: CreateRequisitionInput) => api.post<Requisition>('/requisitions', input),
    [api],
  );
}

export function useSubmitRequisition() {
  const api = useApiClient();
  return useCallback(
    (id: string) => api.post<ApprovalRequestSummary[]>(`/requisitions/${id}/submit`, {}),
    [api],
  );
}
