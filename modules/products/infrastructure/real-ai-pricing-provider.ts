import type { AiRouter, PromptTemplateService } from '@platform/ai';
import { parseJsonResponse } from '@platform/ai';
import type { ProductService } from '../application/product.service';
import type {
  AiPricingProvider,
  PricingRecommendation,
  PricingRecommendationQuery,
} from '../domain/ports/ai-pricing.port';

export const AI_PRICING_PROMPT_KEY = 'products.ai-pricing-recommendation';

/**
 * Real implementation of the AI Pricing seam (doc 12) — see docs/DOMAIN_MODEL_PHASE6.md §9.
 * Lives inside modules/products (not packages/ai) for the same reason
 * RealAiCustomerProfileProvider lives inside modules/customers: it needs this module's own
 * Product/PriceList data, and packages/* must never depend on modules/*.
 *
 * Deliberately pulls only this product's own PriceList entries, not cross-module historical
 * QuotationLineItem data — modules/products has no existing dependency on modules/quotations
 * and adding one purely for this recommendation's context is out of scope for this phase (see
 * docs/DOMAIN_MODEL_PHASE6.md §14).
 */
export class RealAiPricingProvider implements AiPricingProvider {
  constructor(
    private readonly router: AiRouter,
    private readonly prompts: PromptTemplateService,
    private readonly productService: ProductService,
  ) {}

  async recommend(query: PricingRecommendationQuery): Promise<PricingRecommendation> {
    const product = await this.productService.getById(query.productId);
    const priceLists = await this.productService.listPriceLists(product.companyId, query.productId);

    const systemPrompt = await this.prompts.resolve(AI_PRICING_PROMPT_KEY);
    const result = await this.router.chatComplete(
      product.companyId,
      {
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              product: {
                name: product.name,
                sku: product.sku,
                baseUom: product.baseUom,
                standardCost: product.standardCost,
              },
              requestedQuantity: query.quantity,
              requestedCustomerId: query.customerId ?? null,
              existingPriceListEntries: priceLists.map((p) => ({
                customerId: p.customerId,
                currency: p.currency,
                uom: p.uom,
                minQuantity: p.minQuantity,
                unitPrice: p.unitPrice,
                validFrom: p.validFrom,
                validTo: p.validTo,
              })),
            }),
          },
        ],
      },
      { purpose: 'pricing_recommendation' },
    );

    return parseJsonResponse<PricingRecommendation>(result.content, 'AI Pricing');
  }
}
