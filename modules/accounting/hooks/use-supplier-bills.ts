import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface SupplierBill {
  id: string;
  billNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  status: string;
  currency: string;
  totalAmount: string;
  amountPaid: string;
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

export function useSupplierBills(status?: string) {
  const api = useApiClient();
  return useAsync<SupplierBill[]>(() => api.get('/supplier-bills', { status }), [status]);
}

export function useGenerateSupplierBill() {
  const api = useApiClient();
  return useCallback(
    (purchaseOrderId: string, goodsReceiptId?: string) =>
      api.post<SupplierBill>('/supplier-bills/generate', { purchaseOrderId, goodsReceiptId }),
    [api],
  );
}
