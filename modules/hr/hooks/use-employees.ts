import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN';
export type EmploymentStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';

export interface Employee {
  id: string;
  companyId: string;
  userId: string;
  employeeNumber: string;
  departmentId?: string | null;
  teamId?: string | null;
  branchId?: string | null;
  managerId?: string | null;
  jobTitle: string;
  employmentType: EmploymentType;
  employmentStatus: EmploymentStatus;
  hireDate: string;
  terminationDate?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  createdAt: string;
}

export interface CreateEmployeeInput {
  userId: string;
  employeeNumber: string;
  departmentId?: string;
  teamId?: string;
  branchId?: string;
  managerId?: string;
  jobTitle: string;
  employmentType: EmploymentType;
  hireDate: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface UpdateEmployeeInput {
  departmentId?: string;
  teamId?: string;
  branchId?: string;
  managerId?: string;
  jobTitle?: string;
  employmentType?: EmploymentType;
  employmentStatus?: EmploymentStatus;
  terminationDate?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  departmentId: string;
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

export function useEmployees(departmentId?: string) {
  const api = useApiClient();
  return useAsync<Employee[]>(() => api.get('/employees', { departmentId }), [departmentId]);
}

export function useEmployee(id: string) {
  const api = useApiClient();
  return useAsync<Employee>(() => api.get(`/employees/${id}`), [id]);
}

export function useDirectReports(id?: string) {
  const api = useApiClient();
  return useAsync<Employee[]>(
    () => (id ? api.get(`/employees/${id}/reports`) : Promise.resolve([])),
    [id],
  );
}

export function useCreateEmployee() {
  const api = useApiClient();
  return useCallback(
    (input: CreateEmployeeInput) => api.post<Employee>('/employees', input),
    [api],
  );
}

export function useUpdateEmployee() {
  const api = useApiClient();
  return useCallback(
    (id: string, input: UpdateEmployeeInput) => api.put<Employee>(`/employees/${id}`, input),
    [api],
  );
}

// Departments/Teams already exist (Phase 1, modules/users) — reused here directly rather than
// re-fetched through a new HR-owned port, same as every backend lookup port in this module.
export function useDepartments() {
  const api = useApiClient();
  return useAsync<Department[]>(() => api.get('/departments'), []);
}

export function useTeams() {
  const api = useApiClient();
  return useAsync<Team[]>(() => api.get('/teams'), []);
}
