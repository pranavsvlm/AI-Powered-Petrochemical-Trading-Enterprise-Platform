import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export type AiProviderKind = 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'OLLAMA';

export interface AiProviderConfig {
  id: string;
  provider: AiProviderKind;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
  baseUrl: string | null;
  defaultChatModel: string | null;
  defaultEmbedModel: string | null;
  apiKeyRef: string | null;
  monthlyCostCeilingUsd: string | null;
}

export interface UpsertAiProviderInput {
  provider: AiProviderKind;
  enabled?: boolean;
  isDefault?: boolean;
  priority?: number;
  baseUrl?: string;
  defaultChatModel?: string;
  defaultEmbedModel?: string;
  apiKeyRef?: string;
  monthlyCostCeilingUsd?: number;
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

export function useAiProviders() {
  const api = useApiClient();
  return useAsync<AiProviderConfig[]>(() => api.get('/ai/providers'), []);
}

export function useUpsertAiProvider() {
  const api = useApiClient();
  return useCallback(
    (input: UpsertAiProviderInput) => api.post<AiProviderConfig>('/ai/providers', input),
    [api],
  );
}
