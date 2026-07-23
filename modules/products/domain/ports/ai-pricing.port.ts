import { NotImplementedInPhaseError } from '@platform/core';

export interface PricingRecommendationQuery {
  productId: string;
  customerId?: string;
  quantity: number;
}

export interface PricingRecommendation {
  recommendedUnitPrice: number;
  rationale: string;
}

/** See docs/DOMAIN_MODEL_PHASE4.md — no AI pricing provider exists yet; this is a typed seam. */
export interface AiPricingProvider {
  recommend(query: PricingRecommendationQuery): Promise<PricingRecommendation>;
}

export class NotImplementedAiPricingProvider implements AiPricingProvider {
  async recommend(): Promise<PricingRecommendation> {
    throw new NotImplementedInPhaseError('AI Pricing', 'Phase 6+');
  }
}
