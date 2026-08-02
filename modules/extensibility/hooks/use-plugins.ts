import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface PluginListItem {
  key: string;
  name: string;
  description: string;
  category: string;
  installed: boolean;
  enabled: boolean;
  installId: string | null;
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

export function usePlugins() {
  const api = useApiClient();
  return useAsync<PluginListItem[]>(() => api.get('/plugins'), []);
}

export function useInstallPlugin() {
  const api = useApiClient();
  return useCallback((key: string) => api.post(`/plugins/${key}/install`, {}), [api]);
}

export function useActivatePlugin() {
  const api = useApiClient();
  return useCallback((key: string) => api.post(`/plugins/${key}/activate`, {}), [api]);
}

export function useDeactivatePlugin() {
  const api = useApiClient();
  return useCallback((key: string) => api.post(`/plugins/${key}/deactivate`, {}), [api]);
}

export function useUninstallPlugin() {
  const api = useApiClient();
  return useCallback((key: string) => api.del(`/plugins/${key}`), [api]);
}
