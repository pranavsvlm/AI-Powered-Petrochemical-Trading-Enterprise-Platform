import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface PurchaseOrderLineItem {
  id: string;
  productId: string;
  quantity: string;
  uom: string;
  unitPrice: string;
  lineTotal: string;
  receivedQuantity: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  requisitionId?: string | null;
  status: string;
  currency: string;
  subtotal: string;
  totalAmount: string;
  lineItems: PurchaseOrderLineItem[];
}

export interface CreatePurchaseOrderLineInput {
  productId: string;
  quantity: number;
  uom: string;
  unitPrice: number;
}

export interface CreatePurchaseOrderDirectInput {
  poNumber: string;
  supplierId: string;
  currency: string;
  lineItems: CreatePurchaseOrderLineInput[];
}

export interface CreatePurchaseOrderFromRequisitionInput {
  poNumber: string;
  requisitionId: string;
  supplierId: string;
  currency: string;
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

export function usePurchaseOrders(status?: string) {
  const api = useApiClient();
  return useAsync<PurchaseOrder[]>(() => api.get('/purchase-orders', { status }), [status]);
}

export function usePurchaseOrder(id: string) {
  const api = useApiClient();
  return useAsync<PurchaseOrder>(() => api.get(`/purchase-orders/${id}`), [id]);
}

export function useCreatePurchaseOrderDirect() {
  const api = useApiClient();
  return useCallback(
    (input: CreatePurchaseOrderDirectInput) =>
      api.post<PurchaseOrder>('/purchase-orders/direct', input),
    [api],
  );
}

export function useCreatePurchaseOrderFromRequisition() {
  const api = useApiClient();
  return useCallback(
    (input: CreatePurchaseOrderFromRequisitionInput) =>
      api.post<PurchaseOrder>('/purchase-orders/from-requisition', input),
    [api],
  );
}

export function useRequestPurchaseOrderApproval() {
  const api = useApiClient();
  return useCallback(
    (id: string) => api.post(`/purchase-orders/${id}/request-approval`, {}),
    [api],
  );
}

export function useSendPurchaseOrder() {
  const api = useApiClient();
  return useCallback(
    (id: string) => api.post<PurchaseOrder>(`/purchase-orders/${id}/send`, {}),
    [api],
  );
}

export function useCancelPurchaseOrder() {
  const api = useApiClient();
  return useCallback(
    (id: string) => api.post<PurchaseOrder>(`/purchase-orders/${id}/cancel`, {}),
    [api],
  );
}

export function useClosePurchaseOrder() {
  const api = useApiClient();
  return useCallback(
    (id: string) => api.post<PurchaseOrder>(`/purchase-orders/${id}/close`, {}),
    [api],
  );
}
