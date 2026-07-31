import {
  RealAiProductExpertProvider,
  AI_PRODUCT_EXPERT_PROMPT_KEY,
} from './real-ai-product-expert-provider';
import type { AiRouter, PromptTemplateService } from '@platform/ai';
import type { VectorSearchPort } from '@platform/search';
import type { ProductService } from '../application/product.service';

describe('RealAiProductExpertProvider', () => {
  it('retrieves relevant chunks via VectorSearchPort, resolves the prompt, and parses the answer', async () => {
    const router = {
      chatComplete: jest.fn().mockResolvedValue({
        content: '{"answer":"Flash point is -11C.","confidence":0.87}',
        toolCalls: [],
        promptTokens: 10,
        completionTokens: 5,
        provider: 'OLLAMA',
        model: 'llama3.2:1b',
      }),
    };
    const prompts = { resolve: jest.fn().mockResolvedValue('Answer using the retrieved context.') };
    const productService = {
      getById: jest
        .fn()
        .mockResolvedValue({
          id: 'prod-1',
          companyId: 'company-1',
          name: 'Benzene',
          sku: 'BEN-001',
        }),
    };
    const vectorSearch = {
      similaritySearch: jest
        .fn()
        .mockResolvedValue([{ documentId: 'doc-1', chunkText: 'Flash point: -11C', score: 0.9 }]),
    };

    const provider = new RealAiProductExpertProvider(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
      productService as unknown as ProductService,
      vectorSearch as unknown as VectorSearchPort,
    );

    const result = await provider.ask({
      productId: 'prod-1',
      question: 'What is the flash point?',
    });

    expect(productService.getById).toHaveBeenCalledWith('prod-1');
    expect(vectorSearch.similaritySearch).toHaveBeenCalledWith(
      'company-1',
      'Benzene What is the flash point?',
      5,
    );
    expect(prompts.resolve).toHaveBeenCalledWith(AI_PRODUCT_EXPERT_PROMPT_KEY);
    expect(router.chatComplete).toHaveBeenCalledWith('company-1', expect.anything(), {
      purpose: 'product_expert',
    });
    expect(result).toEqual({ answer: 'Flash point is -11C.', confidence: 0.87 });
  });
});
