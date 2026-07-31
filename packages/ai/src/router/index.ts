// AI Router — routes chat/embedding requests across configured providers with fallback +
// per-tenant cost-ceiling enforcement. See docs/DOMAIN_MODEL_PHASE6.md §1-3.
export * from './domain/provider-client.port';
export * from './domain/provider-pricing';
export * from './domain/cost-ceiling';
export * from './domain/fallback-policy';
export * from './domain/errors';
export * from './infrastructure/clients/openai.client';
export * from './infrastructure/clients/anthropic.client';
export * from './infrastructure/clients/gemini.client';
export * from './infrastructure/clients/ollama.client';
export * from './infrastructure/client-factory';
export * from './infrastructure/ai-provider-config.repository';
export * from './infrastructure/ai-usage.repository';
export * from './application/ai-router.service';
