import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface OrderLineItem {
  id: string;
  productId: string;
  quantity: string;
  uom: string;
  unitPrice: string;
  lineTotal: string;
  fulfilledQuantity: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  quotationId?: string | null;
  status: string;
  currency: string;
  incoterm?: string | null;
  subtotal: string;
  totalAmount: string;
  lineItems: OrderLineItem[];
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

export function useOrders(status?: string) {
  const api = useApiClient();
  return useAsync<Order[]>(() => api.get('/orders', { status }), [status]);
}

export function useOrder(id: string) {
  const api = useApiClient();
  return useAsync<Order>(() => api.get(`/orders/${id}`), [id]);
}

export function useCreateOrderFromQuotation() {
  const api = useApiClient();
  return useCallback(
    (orderNumber: string, quotationId: string) =>
      api.post<Order>('/orders/from-quotation', { orderNumber, quotationId }),
    [api],
  );
}

export function useConfirmOrder() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<Order>(`/orders/${id}/confirm`, {}), [api]);
}

export function useFulfillOrderLine() {
  const api = useApiClient();
  return useCallback(
    (orderId: string, lineItemId: string, fulfilledQuantity: number) =>
      api.post<Order>(`/orders/${orderId}/fulfill-line`, { lineItemId, fulfilledQuantity }),
    [api],
  );
}

export function useCloseOrder() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<Order>(`/orders/${id}/close`, {}), [api]);
}

export function useCancelOrder() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<Order>(`/orders/${id}/cancel`, {}), [api]);
}
