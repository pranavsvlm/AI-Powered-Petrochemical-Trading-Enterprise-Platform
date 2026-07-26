import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface GoodsReceiptLineItem {
  id: string;
  purchaseOrderItemId: string;
  quantityReceived: string;
  inspectionResult: string;
  batchNumber?: string | null;
}

export interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  warehouseId: string;
  status: string;
  lineItems: GoodsReceiptLineItem[];
}

export interface CreateGoodsReceiptLineInput {
  purchaseOrderItemId: string;
  quantityReceived: number;
  inspectionResult?: 'PENDING' | 'PASSED' | 'FAILED';
  batchNumber?: string;
}

export interface CreateGoodsReceiptInput {
  receiptNumber: string;
  purchaseOrderId: string;
  warehouseId: string;
  lineItems: CreateGoodsReceiptLineInput[];
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

export function useGoodsReceipts(purchaseOrderId?: string) {
  const api = useApiClient();
  return useAsync<GoodsReceipt[]>(
    () => api.get('/goods-receipts', { purchaseOrderId }),
    [purchaseOrderId],
  );
}

export function useGoodsReceipt(id: string) {
  const api = useApiClient();
  return useAsync<GoodsReceipt>(() => api.get(`/goods-receipts/${id}`), [id]);
}

export function useCreateGoodsReceipt() {
  const api = useApiClient();
  return useCallback(
    (input: CreateGoodsReceiptInput) => api.post<GoodsReceipt>('/goods-receipts', input),
    [api],
  );
}
