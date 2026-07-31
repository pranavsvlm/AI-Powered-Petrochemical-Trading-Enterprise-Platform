/**
 * Classification of a provider-call failure — drives AiRouter's fallback decision (see
 * fallback-policy.ts). TRANSIENT/RATE_LIMITED are worth retrying against the next configured
 * provider; FATAL (a malformed request, an auth failure, etc.) is not — retrying the same
 * broken request against a different provider would just fail again.
 */
export type AiProviderErrorKind = 'TRANSIENT' | 'RATE_LIMITED' | 'FATAL';

export class AiProviderError extends Error {
  public readonly kind: AiProviderErrorKind;
  public readonly provider: string;
  public readonly statusCode?: number;

  constructor(message: string, kind: AiProviderErrorKind, provider: string, statusCode?: number) {
    super(message);
    this.name = 'AiProviderError';
    this.kind = kind;
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

/** Thrown immediately when a call would exceed the company's configured monthly cost ceiling — never falls back to a different (spendier) provider to route around it. */
export class AiCostCeilingExceededError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'AiCostCeilingExceededError';
  }
}

/** Thrown once every configured (and enabled) provider has been tried and failed with a retryable error. */
export class AiAllProvidersExhaustedError extends Error {
  constructor(attempts: Array<{ provider: string; message: string }>) {
    super(
      `All configured AI providers failed: ${attempts.map((a) => `${a.provider} (${a.message})`).join('; ')}`,
    );
    this.name = 'AiAllProvidersExhaustedError';
  }
}

/**
 * Shared HTTP-status classification every fetch-based client uses — 429 is always
 * RATE_LIMITED, any 5xx (including Anthropic's non-standard 529 "overloaded") is TRANSIENT,
 * everything else (4xx — bad request, auth failure, not found) is FATAL.
 */
export function classifyHttpStatus(status: number): AiProviderErrorKind {
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'TRANSIENT';
  return 'FATAL';
}
