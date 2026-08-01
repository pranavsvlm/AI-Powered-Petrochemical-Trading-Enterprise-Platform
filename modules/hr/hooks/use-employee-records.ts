import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface PayrollProfile {
  id: string;
  employeeId: string;
  baseSalary: string;
  currency: string;
  allowances?: Record<string, number> | null;
  deductions?: Record<string, number> | null;
  effectiveFrom: string;
}

export interface PerformanceReview {
  id: string;
  employeeId: string;
  reviewerUserId: string;
  period: string;
  rating?: number | null;
  goals?: Record<string, unknown> | null;
  feedback?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface TrainingRecord {
  id: string;
  employeeId: string;
  courseName: string;
  certificationName?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
}

export interface EmployeeAsset {
  id: string;
  employeeId: string;
  assetType: string;
  description?: string | null;
  assignedAt: string;
  returnedAt?: string | null;
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

export function usePayrollProfile(employeeId: string) {
  const api = useApiClient();
  return useAsync<PayrollProfile | null>(
    () => api.get<PayrollProfile>(`/payroll-profiles/${employeeId}`).catch(() => null),
    [employeeId],
  );
}

export function useSetPayrollProfile() {
  const api = useApiClient();
  return useCallback(
    (input: {
      employeeId: string;
      baseSalary: number;
      currency: string;
      allowances?: Record<string, number>;
      deductions?: Record<string, number>;
      effectiveFrom: string;
    }) => api.post<PayrollProfile>('/payroll-profiles', input),
    [api],
  );
}

export function usePerformanceReviews(employeeId: string) {
  const api = useApiClient();
  return useAsync<PerformanceReview[]>(
    () => api.get(`/performance-reviews/${employeeId}`),
    [employeeId],
  );
}

export function useAddPerformanceReview() {
  const api = useApiClient();
  return useCallback(
    (input: { employeeId: string; period: string; rating?: number; feedback?: string }) =>
      api.post<PerformanceReview>('/performance-reviews', input),
    [api],
  );
}

export function useTrainingRecords(employeeId: string) {
  const api = useApiClient();
  return useAsync<TrainingRecord[]>(() => api.get(`/training-records/${employeeId}`), [employeeId]);
}

export function useAddTrainingRecord() {
  const api = useApiClient();
  return useCallback(
    (input: {
      employeeId: string;
      courseName: string;
      certificationName?: string;
      completedAt?: string;
      expiresAt?: string;
    }) => api.post<TrainingRecord>('/training-records', input),
    [api],
  );
}

export function useEmployeeAssets(employeeId: string) {
  const api = useApiClient();
  return useAsync<EmployeeAsset[]>(() => api.get(`/employee-assets/${employeeId}`), [employeeId]);
}

export function useAssignAsset() {
  const api = useApiClient();
  return useCallback(
    (input: { employeeId: string; assetType: string; description?: string }) =>
      api.post<EmployeeAsset>('/employee-assets', input),
    [api],
  );
}

export function useReturnAsset() {
  const api = useApiClient();
  return useCallback(
    (id: string) => api.post<EmployeeAsset>(`/employee-assets/${id}/return`, {}),
    [api],
  );
}
