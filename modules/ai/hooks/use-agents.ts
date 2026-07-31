import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface Agent {
  id: string;
  key: string;
  name: string;
  description: string;
  version: number;
  capabilities: string[];
  systemPromptTemplateKey: string;
  isBuiltIn: boolean;
}

export interface Tool {
  id: string;
  key: string;
  name: string;
  description: string;
  requiresHumanApproval: boolean;
}

export interface AgentWithTools extends Agent {
  tools: Tool[];
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

export function useAgents() {
  const api = useApiClient();
  return useAsync<Agent[]>(() => api.get('/ai/agents'), []);
}

export function useAgent(key: string | undefined) {
  const api = useApiClient();
  return useAsync<AgentWithTools>(() => api.get(`/ai/agents/${key}`), [key]);
}
