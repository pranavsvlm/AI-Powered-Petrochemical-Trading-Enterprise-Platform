import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface InvoiceItem {
  id: string;
  productId: string;
  description?: string | null;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  status: string;
  currency: string;
  subtotal: string;
  totalAmount: string;
  amountPaid: string;
  items: InvoiceItem[];
}

export interface Payment {
  id: string;
  amount: string;
  currency: string;
  method?: string | null;
  reference?: string | null;
  paidAt: string;
}

export interface RecordPaymentInput {
  amount: number;
  currency: string;
  method?: string;
  reference?: string;
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

export function useInvoices(status?: string) {
  const api = useApiClient();
  return useAsync<Invoice[]>(() => api.get('/invoices', { status }), [status]);
}

export function useInvoice(id: string) {
  const api = useApiClient();
  return useAsync<Invoice>(() => api.get(`/invoices/${id}`), [id]);
}

/** Errors (e.g. no invoice generated yet) resolve to `data: null` rather than surfacing `error`. */
export function useInvoiceByOrderId(orderId: string) {
  const api = useApiClient();
  const { data, loading, refetch } = useAsync<Invoice | null>(
    () => api.get<Invoice>(`/invoices/by-order/${orderId}`).catch(() => null),
    [orderId],
  );
  return { data, loading, refetch };
}

export function usePayments(invoiceId: string) {
  const api = useApiClient();
  return useAsync<Payment[]>(() => api.get(`/invoices/${invoiceId}/payments`), [invoiceId]);
}

export function useRecordPayment() {
  const api = useApiClient();
  return useCallback(
    (invoiceId: string, input: RecordPaymentInput) =>
      api.post<Payment>(`/invoices/${invoiceId}/payments`, input),
    [api],
  );
}
