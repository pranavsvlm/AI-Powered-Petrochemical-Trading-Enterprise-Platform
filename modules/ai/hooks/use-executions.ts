import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export type AgentExecutionStatus =
  'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type ToolExecutionStatus =
  'RUNNING' | 'AWAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED' | 'REJECTED';

export interface AgentExecutionSummary {
  id: string;
  agentId: string;
  agent: { key: string; name: string };
  conversationId: string | null;
  requestedByUserId: string;
  status: AgentExecutionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ToolExecutionWithTool {
  id: string;
  toolId: string;
  tool: { key: string; name: string; description: string };
  status: ToolExecutionStatus;
  input: Record<string, unknown>;
  output: unknown;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface AgentExecutionDetail extends AgentExecutionSummary {
  input: { userMessage: string; conversationId: string };
  output: { text: string } | null;
  errorMessage: string | null;
  totalTokens: number | null;
  totalCostUsd: string | null;
  durationMs: number | null;
  toolExecutions: ToolExecutionWithTool[];
}

/**
 * The shape POST /ai/chat, /ai/execute, and .../approve|reject actually return — the orchestrator's
 * raw execution row, with no `agent`/`toolExecutions` relations included (only GET /ai/executions/:id
 * goes through the enriched query). Callers that need the tool-call trail for a paused execution
 * should re-fetch via `useExecution(id)`.
 */
export interface AgentExecutionResult {
  id: string;
  agentId: string;
  conversationId: string | null;
  requestedByUserId: string;
  status: AgentExecutionStatus;
  input: { userMessage: string; conversationId: string };
  output: { text: string } | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
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

export function useExecutions(status?: AgentExecutionStatus) {
  const api = useApiClient();
  return useAsync<AgentExecutionSummary[]>(() => api.get('/ai/executions', { status }), [status]);
}

export function useExecution(id: string) {
  const api = useApiClient();
  return useAsync<AgentExecutionDetail>(() => api.get(`/ai/executions/${id}`), [id]);
}

export function useApproveExecution() {
  const api = useApiClient();
  return useCallback(
    (id: string, comment?: string) =>
      api.post<AgentExecutionResult>(`/ai/executions/${id}/approve`, { comment }),
    [api],
  );
}

export function useRejectExecution() {
  const api = useApiClient();
  return useCallback(
    (id: string, comment?: string) =>
      api.post<AgentExecutionResult>(`/ai/executions/${id}/reject`, { comment }),
    [api],
  );
}
