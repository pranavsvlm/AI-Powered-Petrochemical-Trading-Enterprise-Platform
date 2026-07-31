/** Mirrors the Prisma `AiProviderKind` enum's values as a plain literal union — domain/ stays framework-free, same convention as modules/inventory's reservation-lifecycle.ts re-declaring its own status union instead of importing the Prisma enum. */
export type AiProviderKind = 'OPENAI' | 'ANTHROPIC' | 'GEMINI' | 'OLLAMA';

export interface PricingEntry {
  promptPricePer1kTokens: number;
  completionPricePer1kTokens: number;
}

/** Keyed by `${provider}:${model}`. */
export type PricingTable = Record<string, PricingEntry>;

/**
 * A representative, hand-maintained snapshot of public per-token pricing (USD) as of the
 * providers' published rate cards — not fetched live. Ollama entries are zero-priced since
 * local inference has no per-token API cost; `AiRouter`'s e2e cost-ceiling test overrides this
 * table with a synthetic non-zero Ollama price specifically to exercise throttling against
 * real traffic without needing a paid provider — see docs/DOMAIN_MODEL_PHASE6.md §3.
 */
export const DEFAULT_PRICING_TABLE: PricingTable = {
  'OPENAI:gpt-4o-mini': { promptPricePer1kTokens: 0.00015, completionPricePer1kTokens: 0.0006 },
  'OPENAI:gpt-4o': { promptPricePer1kTokens: 0.0025, completionPricePer1kTokens: 0.01 },
  'ANTHROPIC:claude-3-5-haiku-20241022': {
    promptPricePer1kTokens: 0.0008,
    completionPricePer1kTokens: 0.004,
  },
  'ANTHROPIC:claude-3-5-sonnet-20241022': {
    promptPricePer1kTokens: 0.003,
    completionPricePer1kTokens: 0.015,
  },
  'GEMINI:gemini-1.5-flash': {
    promptPricePer1kTokens: 0.000075,
    completionPricePer1kTokens: 0.0003,
  },
  'GEMINI:gemini-1.5-pro': { promptPricePer1kTokens: 0.00125, completionPricePer1kTokens: 0.005 },
  'OLLAMA:llama3.2:1b': { promptPricePer1kTokens: 0, completionPricePer1kTokens: 0 },
  'OLLAMA:nomic-embed-text': { promptPricePer1kTokens: 0, completionPricePer1kTokens: 0 },
};

/** Unpriced (model, provider) pairs are treated as free rather than blocking the call — an unknown model shouldn't be able to silently defeat the ceiling either way, so this is a deliberate, documented choice: it fails open on estimation, not closed. */
export function estimateCostUsd(
  table: PricingTable,
  provider: AiProviderKind,
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const entry = table[`${provider}:${model}`];
  if (!entry) return 0;
  return (
    (promptTokens / 1000) * entry.promptPricePer1kTokens +
    (completionTokens / 1000) * entry.completionPricePer1kTokens
  );
}
