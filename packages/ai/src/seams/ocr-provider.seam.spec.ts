import { TenantContextStore } from '@platform/core';
import { RealOcrProvider, OCR_PROMPT_KEY } from './ocr-provider.seam';
import type { AiRouter } from '../router/application/ai-router.service';
import type { PromptTemplateService } from '../prompt-engine/application/prompt-template.service';

function withCompany<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    {
      companyId: 'company-1',
      userId: 'user-1',
      sessionId: null,
      ipAddress: null,
      isPlatformActor: false,
    },
    fn,
  );
}

describe('RealOcrProvider', () => {
  it('sends the buffer as a base64 image attachment and parses {text, confidence} from the response', async () => {
    const router = {
      chatComplete: jest.fn().mockResolvedValue({
        content: '{"text":"INVOICE #123","confidence":0.95}',
        toolCalls: [],
        promptTokens: 100,
        completionTokens: 10,
        provider: 'OLLAMA',
        model: 'llava',
      }),
    };
    const prompts = { resolve: jest.fn().mockResolvedValue('Extract text from images.') };

    const provider = new RealOcrProvider(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
    );
    const buffer = Buffer.from('fake-image-bytes');

    const result = await withCompany(() => provider.extractText(buffer, 'image/png'));

    expect(prompts.resolve).toHaveBeenCalledWith(OCR_PROMPT_KEY);
    expect(router.chatComplete).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'Extract text from images.' },
          {
            role: 'user',
            content: 'Extract all text visible in this image.',
            images: [{ mimeType: 'image/png', dataBase64: buffer.toString('base64') }],
          },
        ],
      }),
      { purpose: 'ocr' },
    );
    expect(result).toEqual({ text: 'INVOICE #123', confidence: 0.95 });
  });
});
