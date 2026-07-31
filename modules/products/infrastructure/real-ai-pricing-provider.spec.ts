import { RealAiPricingProvider, AI_PRICING_PROMPT_KEY } from './real-ai-pricing-provider';
import type { AiRouter, PromptTemplateService } from '@platform/ai';
import type { ProductService } from '../application/product.service';

describe('RealAiPricingProvider', () => {
  it('gathers the product + its price list entries, resolves the prompt, and parses the recommendation', async () => {
    const router = {
      chatComplete: jest.fn().mockResolvedValue({
        content: '{"recommendedUnitPrice":42.5,"rationale":"in line with volume tier"}',
        toolCalls: [],
        promptTokens: 10,
        completionTokens: 5,
        provider: 'OLLAMA',
        model: 'llama3.2:1b',
      }),
    };
    const prompts = { resolve: jest.fn().mockResolvedValue('Recommend a price.') };
    const productService = {
      getById: jest.fn().mockResolvedValue({
        id: 'prod-1',
        companyId: 'company-1',
        name: 'Benzene',
        sku: 'BEN-001',
        baseUom: 'MT',
        standardCost: 300,
      }),
      listPriceLists: jest
        .fn()
        .mockResolvedValue([
          {
            customerId: null,
            currency: 'USD',
            uom: 'MT',
            minQuantity: 10,
            unitPrice: 40,
            validFrom: null,
            validTo: null,
          },
        ]),
    };

    const provider = new RealAiPricingProvider(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
      productService as unknown as ProductService,
    );

    const result = await provider.recommend({
      productId: 'prod-1',
      customerId: 'cust-1',
      quantity: 25,
    });

    expect(productService.getById).toHaveBeenCalledWith('prod-1');
    expect(productService.listPriceLists).toHaveBeenCalledWith('company-1', 'prod-1');
    expect(prompts.resolve).toHaveBeenCalledWith(AI_PRICING_PROMPT_KEY);
    expect(router.chatComplete).toHaveBeenCalledWith('company-1', expect.anything(), {
      purpose: 'pricing_recommendation',
    });
    expect(result).toEqual({ recommendedUnitPrice: 42.5, rationale: 'in line with volume tier' });
  });
});
