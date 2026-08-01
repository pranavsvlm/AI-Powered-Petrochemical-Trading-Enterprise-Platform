import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export type LeaveType = 'ANNUAL' | 'SICK' | 'UNPAID' | 'CUSTOM';
export type LeaveRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeavePolicy {
  id: string;
  companyId: string;
  type: LeaveType;
  name: string;
  daysPerYear: number;
}

export interface LeaveRequest {
  id: string;
  companyId: string;
  employeeId: string;
  policyId: string;
  startDate: string;
  endDate: string;
  status: LeaveRequestStatus;
  reason?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

export interface PendingApproval {
  id: string;
  entityId: string;
  approverUserId?: string | null;
  approverRoleId?: string | null;
  status: string;
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

export function useLeavePolicies() {
  const api = useApiClient();
  return useAsync<LeavePolicy[]>(() => api.get('/leave-policies'), []);
}

export function useCreateLeavePolicy() {
  const api = useApiClient();
  return useCallback(
    (input: { type: LeaveType; name: string; daysPerYear: number }) =>
      api.post<LeavePolicy>('/leave-policies', input),
    [api],
  );
}

export function useLeaveRequests(employeeId?: string) {
  const api = useApiClient();
  return useAsync<LeaveRequest[]>(() => api.get('/leave', { employeeId }), [employeeId]);
}

export function useRequestLeave() {
  const api = useApiClient();
  return useCallback(
    (input: {
      employeeId: string;
      policyId: string;
      startDate: string;
      endDate: string;
      reason?: string;
    }) => api.post<LeaveRequest>('/leave', input),
    [api],
  );
}

export function useLeaveBalance(employeeId?: string, policyId?: string) {
  const api = useApiClient();
  return useAsync<{ balance: number } | null>(
    () =>
      employeeId && policyId
        ? api.get('/leave/balance', { employeeId, policyId })
        : Promise.resolve(null),
    [employeeId, policyId],
  );
}

export function usePendingApprovals(leaveRequestId?: string) {
  const api = useApiClient();
  return useAsync<PendingApproval[]>(
    () => (leaveRequestId ? api.get(`/leave/${leaveRequestId}/approvals`) : Promise.resolve([])),
    [leaveRequestId],
  );
}

export function useDecideLeave() {
  const api = useApiClient();
  return useCallback(
    (approvalId: string, decision: 'APPROVED' | 'REJECTED', comment?: string) =>
      api.post<LeaveRequest>(`/leave/approvals/${approvalId}/decide`, { decision, comment }),
    [api],
  );
}
