import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface TimeEntry {
  id: string;
  userId: string;
  taskId?: string | null;
  projectId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
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

export function useTimeEntries(taskId?: string, projectId?: string) {
  const api = useApiClient();
  return useAsync<TimeEntry[]>(
    () => api.get('/time-entries', { taskId, projectId }),
    [taskId, projectId],
  );
}

export function useStartTimer() {
  const api = useApiClient();
  return useCallback(
    (input: { taskId?: string; projectId?: string; notes?: string }) =>
      api.post<TimeEntry>('/time-entries/start', input),
    [api],
  );
}

export function useStopTimer() {
  const api = useApiClient();
  return useCallback((id: string) => api.post<TimeEntry>(`/time-entries/${id}/stop`, {}), [api]);
}

export function useCreateManualTimeEntry() {
  const api = useApiClient();
  return useCallback(
    (input: {
      taskId?: string;
      projectId?: string;
      startedAt: string;
      endedAt: string;
      notes?: string;
    }) => api.post<TimeEntry>('/time-entries', input),
    [api],
  );
}
