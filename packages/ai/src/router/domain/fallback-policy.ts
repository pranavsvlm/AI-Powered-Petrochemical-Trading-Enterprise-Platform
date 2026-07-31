import type { AiProviderErrorKind } from './errors';
import type { AiProviderKind } from './provider-pricing';

export interface ProviderConfigLike {
  provider: AiProviderKind;
  enabled: boolean;
  isDefault: boolean;
  priority: number;
}

/**
 * Orders enabled providers for a chat/embed call: the company's preferred default first (if
 * it's actually enabled), then the configured `isDefault` provider, then ascending `priority`.
 * Disabled providers are dropped entirely — never attempted, not even as a last resort.
 */
export function selectProviderOrder<T extends ProviderConfigLike>(
  configs: T[],
  preferredProvider?: AiProviderKind | null,
): T[] {
  const enabled = configs.filter((c) => c.enabled);
  return [...enabled].sort((a, b) => {
    const aPreferred = a.provider === preferredProvider ? 0 : 1;
    const bPreferred = b.provider === preferredProvider ? 0 : 1;
    if (aPreferred !== bPreferred) return aPreferred - bPreferred;
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.priority - b.priority;
  });
}

/**
 * Only TRANSIENT/RATE_LIMITED failures are worth retrying against the next configured
 * provider — a FATAL error means the request itself was bad (malformed input, auth failure),
 * and retrying the identical request elsewhere would just fail again. Cost-ceiling breaches
 * are handled entirely separately, before any provider is even attempted (see cost-ceiling.ts)
 * — they never reach this function.
 */
export function shouldFallback(kind: AiProviderErrorKind): boolean {
  return kind === 'TRANSIENT' || kind === 'RATE_LIMITED';
}
