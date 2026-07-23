import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface QuotationLineItem {
  id: string;
  productId: string;
  quantity: string;
  uom: string;
  unitPrice: string;
  discountPercent: string;
  lineTotal: string;
}

export interface QuotationVersion {
  versionNumber: number;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  marginPercent?: string | null;
  lineItems: QuotationLineItem[];
}

export interface Quotation {
  id: string;
  quotationNumber: string;
  rfqId?: string | null;
  customerId: string;
  status: string;
  currency: string;
  currentVersionNumber: number;
  subtotal: string;
  discountAmount: string;
  totalAmount: string;
  versions: QuotationVersion[];
}

export interface ApprovalRequest {
  id: string;
  status: string;
}

export interface CreateQuotationLineInput {
  productId: string;
  quantity: number;
  discountPercent?: number;
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

export function useQuotations(status?: string) {
  const api = useApiClient();
  return useAsync<Quotation[]>(() => api.get('/quotations', { status }), [status]);
}

export function useQuotation(id: string) {
  const api = useApiClient();
  return useAsync<Quotation>(() => api.get(`/quotations/${id}`), [id]);
}

export function useCreateQuotationFromRfq() {
  const api = useApiClient();
  return useCallback(
    (input: { quotationNumber: string; rfqId: string; lineItems: CreateQuotationLineInput[] }) =>
      api.post<Quotation>('/quotations/from-rfq', input),
    [api],
  );
}

export function useSendQuotation() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<Quotation>(`/quotations/${id}/send`, {}), [api]);
}

export function useNegotiateQuotation() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<Quotation>(`/quotations/${id}/negotiate`, {}), [api]);
}

export interface ReviseQuotationLineInput {
  productId: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  discountPercent?: number;
}

export function useReviseQuotation() {
  const api = useApiClient();
  return useCallback(
    (id: string, lineItems: ReviseQuotationLineInput[]) =>
      api.post<Quotation>(`/quotations/${id}/revise`, { lineItems }),
    [api],
  );
}

export function useRequestQuotationApproval() {
  const api = useApiClient();
  return useCallback(
    (id: string) => api.post<ApprovalRequest[]>(`/quotations/${id}/request-approval`, {}),
    [api],
  );
}

export function useDecideQuotationApproval() {
  const api = useApiClient();
  return useCallback(
    (approvalId: string, decision: 'APPROVED' | 'REJECTED', comment?: string) =>
      api.post<ApprovalRequest>('/quotations/approve', { approvalId, decision, comment }),
    [api],
  );
}
