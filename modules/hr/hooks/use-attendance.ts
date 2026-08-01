import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface Shift {
  id: string;
  companyId: string;
  name: string;
  startTime: string;
  endTime: string;
}

export interface AttendanceRecord {
  id: string;
  companyId: string;
  employeeId: string;
  date: string;
  clockInAt: string;
  clockOutAt?: string | null;
}

export interface ClockOutResult {
  record: AttendanceRecord;
  workedHours: number;
  overtimeHours: number;
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

export function useAttendance(employeeId?: string) {
  const api = useApiClient();
  return useAsync<AttendanceRecord[]>(() => api.get('/attendance', { employeeId }), [employeeId]);
}

export function useClockIn() {
  const api = useApiClient();
  return useCallback(
    (employeeId: string) => api.post<AttendanceRecord>('/attendance', { employeeId }),
    [api],
  );
}

export function useClockOut() {
  const api = useApiClient();
  return useCallback(
    (id: string, shiftHours?: number) =>
      api.post<ClockOutResult>(`/attendance/${id}/clock-out`, { shiftHours }),
    [api],
  );
}

export function useShifts() {
  const api = useApiClient();
  return useAsync<Shift[]>(() => api.get('/shifts'), []);
}

export function useCreateShift() {
  const api = useApiClient();
  return useCallback(
    (input: { name: string; startTime: string; endTime: string }) =>
      api.post<Shift>('/shifts', input),
    [api],
  );
}
