import type { AiRouter, PromptTemplateService } from '@platform/ai';
import { parseJsonResponse } from '@platform/ai';
import type { VectorSearchPort } from '@platform/search';
import type { ProductService } from '../application/product.service';
import type {
  AiProductExpertProvider,
  ProductExpertAnswer,
  ProductExpertQuery,
} from '../domain/ports/ai-product-expert.port';

export const AI_PRODUCT_EXPERT_PROMPT_KEY = 'products.ai-product-expert';

/**
 * Real implementation of the AI Product Expert seam (doc 12) — RAG over product spec
 * Documents via the shared VectorSearchPort (packages/search's PgVectorSearchProvider — see
 * docs/DOMAIN_MODEL_PHASE6.md §7/§9). Lives inside modules/products for the same
 * packages-never-depend-on-modules reason as RealAiPricingProvider; depending on
 * `@platform/search` directly here is fine (modules -> packages is the normal direction).
 */
export class RealAiProductExpertProvider implements AiProductExpertProvider {
  constructor(
    private readonly router: AiRouter,
    private readonly prompts: PromptTemplateService,
    private readonly productService: ProductService,
    private readonly vectorSearch: VectorSearchPort,
  ) {}

  async ask(query: ProductExpertQuery): Promise<ProductExpertAnswer> {
    const product = await this.productService.getById(query.productId);
    const hits = await this.vectorSearch.similaritySearch(
      product.companyId,
      `${product.name} ${query.question}`,
      5,
    );

    const systemPrompt = await this.prompts.resolve(AI_PRODUCT_EXPERT_PROMPT_KEY);
    const result = await this.router.chatComplete(
      product.companyId,
      {
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              product: { name: product.name, sku: product.sku },
              question: query.question,
              retrievedContext: hits.map((h) => h.chunkText),
            }),
          },
        ],
      },
      { purpose: 'product_expert' },
    );

    return parseJsonResponse<ProductExpertAnswer>(result.content, 'AI Product Expert');
  }
}
