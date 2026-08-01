import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';
import type { Task } from './use-tasks';

export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';
export type MilestoneStatus = 'PENDING' | 'COMPLETED';

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status: ProjectStatus;
  ownerUserId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budget?: string | null;
  createdAt: string;
}

export interface ProjectMember {
  id: string;
  userId: string;
  addedAt: string;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  dueDate?: string | null;
  status: MilestoneStatus;
  completedAt?: string | null;
}

export interface ProjectWithChildren extends Project {
  members: ProjectMember[];
  milestones: ProjectMilestone[];
  tasks: Task[];
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  ownerUserId?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
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

export function useProjects(status?: ProjectStatus) {
  const api = useApiClient();
  return useAsync<Project[]>(() => api.get('/projects', { status }), [status]);
}

export function useProject(id: string) {
  const api = useApiClient();
  return useAsync<ProjectWithChildren>(() => api.get(`/projects/${id}`), [id]);
}

export function useCreateProject() {
  const api = useApiClient();
  return useCallback((input: CreateProjectInput) => api.post<Project>('/projects', input), [api]);
}

export function useAddProjectMember() {
  const api = useApiClient();
  return useCallback(
    (projectId: string, userId: string) =>
      api.post<ProjectMember>(`/projects/${projectId}/members`, { userId }),
    [api],
  );
}

export function useAddProjectMilestone() {
  const api = useApiClient();
  return useCallback(
    (projectId: string, title: string, dueDate?: string) =>
      api.post<ProjectMilestone>(`/projects/${projectId}/milestones`, { title, dueDate }),
    [api],
  );
}

export function useCompleteMilestone() {
  const api = useApiClient();
  return useCallback(
    (milestoneId: string) =>
      api.post<ProjectMilestone>(`/projects/milestones/${milestoneId}/complete`, {}),
    [api],
  );
}
