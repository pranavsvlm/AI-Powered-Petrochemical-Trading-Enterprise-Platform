import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface Customer {
  id: string;
  customerCode: string;
  legalName: string;
  tradeName?: string | null;
  country: string;
  currency: string;
  status: string;
  customerType?: string | null;
  segment?: string | null;
  creditLimit?: string | null;
  paymentTermsDays?: number | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  isPrimary: boolean;
}

export interface TimelineEntry {
  eventType: string;
  actorUserId: string | null;
  createdAt: string;
  after?: unknown;
}

export interface CustomerProfileInsight {
  summary: string;
  recommendedActions: string[];
}

export interface CreateCustomerInput {
  customerCode: string;
  legalName: string;
  tradeName?: string;
  country: string;
  currency: string;
  customerType?: string;
  segment?: string;
  creditLimit?: number;
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

export function useCustomers(status?: string) {
  const api = useApiClient();
  return useAsync<Customer[]>(() => api.get('/customers', { status }), [status]);
}

export function useCustomer(id: string) {
  const api = useApiClient();
  return useAsync<Customer & { contacts: Contact[] }>(() => api.get(`/customers/${id}`), [id]);
}

export function useCustomerTimeline(id: string) {
  const api = useApiClient();
  return useAsync<TimelineEntry[]>(() => api.get(`/customers/${id}/timeline`), [id]);
}

export function useCreateCustomer() {
  const api = useApiClient();
  return useCallback(
    (input: CreateCustomerInput) => api.post<Customer>('/customers', input),
    [api],
  );
}

export function useAddContact() {
  const api = useApiClient();
  return useCallback(
    (customerId: string, input: Omit<Contact, 'id' | 'isPrimary'> & { isPrimary?: boolean }) =>
      api.post<Contact>(`/customers/${customerId}/contacts`, input),
    [api],
  );
}

export function useTransitionCustomerStatus() {
  const api = useApiClient();
  return useCallback(
    (customerId: string, status: string) =>
      api.post<Customer>(`/customers/${customerId}/transition`, { status }),
    [api],
  );
}

export function useRequestCustomerApproval() {
  const api = useApiClient();
  return useCallback(
    (customerId: string) => api.post(`/customers/${customerId}/request-approval`, {}),
    [api],
  );
}

export function useCustomerAiAnalysis() {
  const api = useApiClient();
  return useCallback(
    (customerId: string) =>
      api.post<CustomerProfileInsight>(`/customers/${customerId}/ai-analysis`, {}),
    [api],
  );
}
