import { useCallback, useEffect, useState } from 'react';
import { useApiClient } from '@platform/ui';

export interface Webhook {
  id: string;
  companyId: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  attempt: number;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  responseStatusCode?: number | null;
  lastAttemptAt?: string | null;
  createdAt: string;
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

export function useWebhooks() {
  const api = useApiClient();
  return useAsync<Webhook[]>(() => api.get('/webhooks'), []);
}

export function useCreateWebhook() {
  const api = useApiClient();
  return useCallback(
    (url: string, eventTypes: string[]) => api.post<Webhook>('/webhooks', { url, eventTypes }),
    [api],
  );
}

export function useTestWebhook() {
  const api = useApiClient();
  return useCallback(
    (webhookId: string) => api.post<WebhookDelivery>('/webhooks/test', { webhookId }),
    [api],
  );
}

export function useWebhookDeliveries(webhookId?: string) {
  const api = useApiClient();
  return useAsync<WebhookDelivery[]>(
    () => (webhookId ? api.get(`/webhooks/${webhookId}/deliveries`) : Promise.resolve([])),
    [webhookId],
  );
}
