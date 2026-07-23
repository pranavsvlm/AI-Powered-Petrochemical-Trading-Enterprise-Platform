import { createContext, useContext } from 'react';

/**
 * The one API-calling seam every module's `hooks/` are allowed to depend on. Modules never
 * import an app's concrete fetch wrapper directly (that would invert the module -> app
 * dependency direction) — the consuming app (apps/desktop today; apps/portal or apps/mobile
 * later) provides a concrete ApiClient via <ApiClientProvider>, and module hooks call
 * useApiClient() the same way backend services call an injected port.
 */
export interface ApiClient {
  get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  del<T>(path: string): Promise<T>;
}

const ApiClientContext = createContext<ApiClient | null>(null);

export const ApiClientProvider = ApiClientContext.Provider;

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error('useApiClient must be used within an ApiClientProvider.');
  return client;
}
