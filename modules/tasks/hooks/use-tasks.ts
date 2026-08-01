import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus =
  'BACKLOG' | 'PLANNED' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'ARCHIVED';

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string | null;
  startDate?: string | null;
  assigneeUserId?: string | null;
  assigneeTeamId?: string | null;
  projectId?: string | null;
  createdByUserId?: string | null;
  sourceModule?: string | null;
  sourceEntityId?: string | null;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  authorUserId: string;
  content: string;
  createdAt: string;
}

export interface TaskChecklistItem {
  id: string;
  label: string;
  isDone: boolean;
  position: number;
}

export interface TaskWithChildren extends Task {
  comments: TaskComment[];
  checklist: TaskChecklistItem[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  startDate?: string;
  assigneeUserId?: string;
  assigneeTeamId?: string;
  projectId?: string;
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

export function useTasks(status?: TaskStatus, projectId?: string) {
  const api = useApiClient();
  return useAsync<Task[]>(() => api.get('/tasks', { status, projectId }), [status, projectId]);
}

export function useTask(id: string) {
  const api = useApiClient();
  return useAsync<TaskWithChildren>(() => api.get(`/tasks/${id}`), [id]);
}

export function useCreateTask() {
  const api = useApiClient();
  return useCallback((input: CreateTaskInput) => api.post<Task>('/tasks', input), [api]);
}

export function useChangeTaskStatus() {
  const api = useApiClient();
  return useCallback(
    (id: string, status: TaskStatus) => api.post<Task>(`/tasks/${id}/status`, { status }),
    [api],
  );
}

export function useAssignTask() {
  const api = useApiClient();
  return useCallback(
    (id: string, assigneeUserId?: string, assigneeTeamId?: string) =>
      api.post<Task>(`/tasks/${id}/assign`, { assigneeUserId, assigneeTeamId }),
    [api],
  );
}

export function useArchiveTask() {
  const api = useApiClient();
  return useCallback((id: string) => api.del<Task>(`/tasks/${id}`), [api]);
}

export function useAddTaskComment() {
  const api = useApiClient();
  return useCallback(
    (id: string, content: string) => api.post<TaskComment>(`/tasks/${id}/comments`, { content }),
    [api],
  );
}

export function useAddChecklistItem() {
  const api = useApiClient();
  return useCallback(
    (id: string, label: string) =>
      api.post<TaskChecklistItem>(`/tasks/${id}/checklist-items`, { label }),
    [api],
  );
}

export function useSetChecklistItemDone() {
  const api = useApiClient();
  return useCallback(
    (taskId: string, itemId: string, isDone: boolean) =>
      api.put<TaskChecklistItem>(`/tasks/${taskId}/checklist-items/${itemId}`, { isDone }),
    [api],
  );
}
