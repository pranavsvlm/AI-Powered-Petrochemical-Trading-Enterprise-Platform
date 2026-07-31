import type { AiProviderConfig } from '@platform/database';
import type { LlmProviderClient } from '../domain/provider-client.port';
import { OpenAiClient } from './clients/openai.client';
import { AnthropicClient } from './clients/anthropic.client';
import { GeminiClient } from './clients/gemini.client';
import { OllamaClient } from './clients/ollama.client';

/** Resolves an `AiProviderConfig.apiKeyRef` (an env-var/secret-manager key *name*, never a raw key) to the actual secret. */
export type ApiKeyResolver = (apiKeyRef: string) => string | undefined;

export const defaultApiKeyResolver: ApiKeyResolver = (apiKeyRef) => process.env[apiKeyRef];

/**
 * Builds the real fetch-based client for whichever provider a company's `AiProviderConfig` row
 * names, using that row's own `baseUrl` override (e.g. a self-hosted Ollama address) and
 * resolved API key. OLLAMA needs no key. See docs/DOMAIN_MODEL_PHASE6.md §2.
 */
export function buildProviderClient(
  config: Pick<AiProviderConfig, 'provider' | 'baseUrl' | 'apiKeyRef'>,
  resolveApiKey: ApiKeyResolver = defaultApiKeyResolver,
): LlmProviderClient {
  const apiKey = config.apiKeyRef ? resolveApiKey(config.apiKeyRef) : undefined;
  switch (config.provider) {
    case 'OPENAI':
      if (!apiKey) throw new Error('AiProviderConfig for OPENAI is missing a resolvable apiKeyRef');
      return new OpenAiClient({ apiKey, baseUrl: config.baseUrl ?? undefined });
    case 'ANTHROPIC':
      if (!apiKey)
        throw new Error('AiProviderConfig for ANTHROPIC is missing a resolvable apiKeyRef');
      return new AnthropicClient({ apiKey, baseUrl: config.baseUrl ?? undefined });
    case 'GEMINI':
      if (!apiKey) throw new Error('AiProviderConfig for GEMINI is missing a resolvable apiKeyRef');
      return new GeminiClient({ apiKey, baseUrl: config.baseUrl ?? undefined });
    case 'OLLAMA':
      return new OllamaClient({ baseUrl: config.baseUrl ?? undefined });
    default: {
      const exhaustive: never = config.provider;
      throw new Error(`Unknown AI provider kind: ${String(exhaustive)}`);
    }
  }
}
