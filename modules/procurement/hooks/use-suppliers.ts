import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface SupplierContact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  isPrimary: boolean;
}

export interface Supplier {
  id: string;
  supplierCode: string;
  legalName: string;
  tradeName?: string | null;
  country: string;
  currency: string;
  status: string;
  paymentTermsDays?: number | null;
  contacts?: SupplierContact[];
}

export interface CreateSupplierInput {
  supplierCode: string;
  legalName: string;
  tradeName?: string;
  country: string;
  currency: string;
  paymentTermsDays?: number;
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

export function useSuppliers(status?: string) {
  const api = useApiClient();
  return useAsync<Supplier[]>(() => api.get('/suppliers', { status }), [status]);
}

export function useSupplier(id: string) {
  const api = useApiClient();
  return useAsync<Supplier>(() => api.get(`/suppliers/${id}`), [id]);
}

export function useCreateSupplier() {
  const api = useApiClient();
  return useCallback(
    (input: CreateSupplierInput) => api.post<Supplier>('/suppliers', input),
    [api],
  );
}

export function useSuspendSupplier() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<Supplier>(`/suppliers/${id}/suspend`, {}), [api]);
}

export function useActivateSupplier() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<Supplier>(`/suppliers/${id}/activate`, {}), [api]);
}

export function useAddSupplierContact() {
  const api = useApiClient();
  return useCallback(
    (
      supplierId: string,
      input: Omit<SupplierContact, 'id' | 'isPrimary'> & { isPrimary?: boolean },
    ) => api.post<SupplierContact>(`/suppliers/${supplierId}/contacts`, input),
    [api],
  );
}
