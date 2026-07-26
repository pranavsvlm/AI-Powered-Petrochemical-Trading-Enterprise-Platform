import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: string;
  quantityReserved: string;
  reorderPoint?: string | null;
}

export interface InventoryMovement {
  id: string;
  inventoryItemId: string;
  movementType: string;
  quantity: string;
  entityType: string;
  entityId?: string | null;
  note?: string | null;
  createdAt: string;
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

export function useInventoryItems(warehouseId?: string) {
  const api = useApiClient();
  return useAsync<InventoryItem[]>(
    () => api.get('/inventory/items', { warehouseId }),
    [warehouseId],
  );
}

export function useInventoryItem(id: string) {
  const api = useApiClient();
  return useAsync<InventoryItem>(() => api.get(`/inventory/items/${id}`), [id]);
}

export function useMovements(inventoryItemId?: string) {
  const api = useApiClient();
  return useAsync<InventoryMovement[]>(
    () => api.get('/inventory/movements', { inventoryItemId }),
    [inventoryItemId],
  );
}

export function useAdjustStock() {
  const api = useApiClient();
  return useCallback(
    (id: string, quantityDelta: number, reason: string) =>
      api.post<InventoryItem>(`/inventory/items/${id}/adjust`, { quantityDelta, reason }),
    [api],
  );
}
