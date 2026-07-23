import type { ApiClient } from '@platform/ui';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;

/** Called once by AuthContext whenever the access token changes (login, refresh, logout). */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: ApiFetchOptions['query']): string {
  const url = new URL(BASE_URL + path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.pathname + url.search;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {
      // response wasn't JSON — use the raw text
    }
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** The concrete ApiClient (@platform/ui) this app provides to every module's hooks. */
export const desktopApiClient: ApiClient = {
  get: (path, query) => apiFetch(path, { method: 'GET', query }),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body }),
  del: (path) => apiFetch(path, { method: 'DELETE' }),
};
