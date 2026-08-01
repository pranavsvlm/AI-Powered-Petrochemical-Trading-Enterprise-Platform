import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export type DashboardSection =
  'executive' | 'sales' | 'trading' | 'finance' | 'inventory' | 'procurement' | 'ai';

export interface ExecutiveKpis {
  revenueMonthToDate: number;
  grossProfit: number;
  outstandingReceivables: number;
}

export interface SalesKpis {
  customerCountsByStatus: Record<string, number>;
  quotationCountsByStatus: Record<string, number>;
  quoteWinRate: number;
  revenueByCustomer: Array<{ customerId: string; revenue: number }>;
  revenueByCountry: Array<{ country: string; revenue: number }>;
  revenueByProduct: Array<{ productId: string; revenue: number }>;
  rfqCountsByStatus: Record<string, number>;
}

export interface TradingKpis {
  rfqCountsByStatus: Record<string, number>;
  quotationCountsByStatus: Record<string, number>;
  orderCountsByStatus: Record<string, number>;
  marginByProduct: Array<{ productId: string; averageMarginPercent: number }>;
  marginByCustomer: Array<{ customerId: string; averageMarginPercent: number }>;
}

export interface FinanceKpis {
  trialBalance: { totalDebits: number; totalCredits: number; isBalanced: boolean };
  profitAndLoss: { revenue: number; expenses: number; netIncome: number };
}

export interface InventoryKpis {
  stockByProduct: Array<{ productId: string; quantityOnHand: number }>;
  inventoryValue: number;
}

export interface ProcurementKpis {
  spendBySupplier: Array<{ supplierId: string; spend: number }>;
  spendMonthToDate: number;
}

export interface AiKpis {
  requestCount: number;
  totalCostUsd: number;
  automationRate: number;
  humanOverrideRate: number;
  promptSuccessRate: number;
}

export interface Forecast {
  id: string;
  type: string;
  horizonMonths: number;
  basisPeriods: number;
  projectedValue: string;
  generatedAt: string;
}

export interface AIInsight {
  id: string;
  type: string;
  title: string;
  body: string;
  generatedAt: string;
}

export interface Report {
  id: string;
  type: string;
  format: 'PDF' | 'CSV';
  documentId?: string | null;
  scheduleId?: string | null;
  generatedAt: string;
}

export interface ReportSchedule {
  id: string;
  reportType: string;
  format: 'PDF' | 'CSV';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recipientEmails: string[];
  isActive: boolean;
  lastRunAt?: string | null;
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

export function useDashboardSection<T>(section: DashboardSection) {
  const api = useApiClient();
  return useAsync<T>(() => api.get(`/analytics/dashboard/${section}`), [section]);
}

export function useLatestForecast(type: 'SALES' = 'SALES') {
  const api = useApiClient();
  return useAsync<Forecast | null>(() => api.get(`/analytics/forecast/${type}`), [type]);
}

export function useGenerateForecast() {
  const api = useApiClient();
  return useCallback(
    (type: 'SALES' = 'SALES') => api.post<Forecast>(`/analytics/forecast/${type}`, {}),
    [api],
  );
}

export function useInsights() {
  const api = useApiClient();
  return useAsync<AIInsight[]>(() => api.get('/analytics/insights'), []);
}

export function useGenerateInsight() {
  const api = useApiClient();
  return useCallback(() => api.post<AIInsight>('/analytics/insights', {}), [api]);
}

export function useReports() {
  const api = useApiClient();
  return useAsync<Report[]>(() => api.get('/analytics/reports'), []);
}

export function useGenerateReport() {
  const api = useApiClient();
  return useCallback(
    (type: string, format: 'PDF' | 'CSV') =>
      api.post<Report>('/analytics/reports', { type, format }),
    [api],
  );
}

export function useSchedules() {
  const api = useApiClient();
  return useAsync<ReportSchedule[]>(() => api.get('/analytics/schedules'), []);
}

export interface CreateScheduleInput {
  reportType: string;
  format: 'PDF' | 'CSV';
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  recipientEmails: string[];
}

export function useCreateSchedule() {
  const api = useApiClient();
  return useCallback(
    (input: CreateScheduleInput) => api.post<ReportSchedule>('/analytics/schedules', input),
    [api],
  );
}

export function useToggleSchedule() {
  const api = useApiClient();
  return useCallback(
    (id: string, active: boolean) =>
      api.post<ReportSchedule>(`/analytics/schedules/${id}/${active ? 'resume' : 'pause'}`, {}),
    [api],
  );
}
