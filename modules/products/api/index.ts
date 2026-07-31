export { ProductService } from '../application/product.service';
export type {
  ProductAuditWriter,
  ProductEventPublisher,
  ApprovalEvaluator,
  GetEffectivePriceQuery,
} from '../application/product.service';
export { ProductRepository } from '../infrastructure/product.repository';
export type {
  CreateProductInput,
  UpdateProductInput,
  UpsertPriceListInput,
} from '../infrastructure/product.repository';
export { resolvePrice, computeMargin } from '../domain/pricing';
export type { PriceListEntry, PriceResolutionQuery, ResolvedPrice } from '../domain/pricing';
export { castAttributeValue } from '../domain/attribute-cast';
export type { AttributeDefinition, CastAttributeResult } from '../domain/attribute-cast';
export { NotImplementedAiProductExpertProvider } from '../domain/ports/ai-product-expert.port';
export type { AiProductExpertProvider } from '../domain/ports/ai-product-expert.port';
export { NotImplementedAiPricingProvider } from '../domain/ports/ai-pricing.port';
export type { AiPricingProvider } from '../domain/ports/ai-pricing.port';
export {
  RealAiPricingProvider,
  AI_PRICING_PROMPT_KEY,
} from '../infrastructure/real-ai-pricing-provider';
export {
  RealAiProductExpertProvider,
  AI_PRODUCT_EXPERT_PROMPT_KEY,
} from '../infrastructure/real-ai-product-expert-provider';
