import { TenantContextStore } from '@platform/core';
import type { OcrProvider, OcrResult } from '@platform/storage';
import type { AiRouter } from '../router/application/ai-router.service';
import type { PromptTemplateService } from '../prompt-engine/application/prompt-template.service';
import { parseJsonResponse } from './domain/parse-json-response';

export const OCR_PROMPT_KEY = 'storage.ocr-extract';

/**
 * Real implementation of the OCR seam (doc 21 / DOMAIN_MODEL_PHASE3.md §3) — routed through
 * the same AiRouter as every other AI call, using a vision-capable chat model rather than a
 * separate Tesseract dependency. See docs/DOMAIN_MODEL_PHASE6.md §9.
 */
export class RealOcrProvider implements OcrProvider {
  constructor(
    private readonly router: AiRouter,
    private readonly prompts: PromptTemplateService,
  ) {}

  async extractText(buffer: Buffer, contentType: string): Promise<OcrResult> {
    const companyId = TenantContextStore.requireCompanyId();
    const systemPrompt = await this.prompts.resolve(OCR_PROMPT_KEY);
    const result = await this.router.chatComplete(
      companyId,
      {
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: 'Extract all text visible in this image.',
            images: [{ mimeType: contentType, dataBase64: buffer.toString('base64') }],
          },
        ],
      },
      { purpose: 'ocr' },
    );
    return parseJsonResponse<OcrResult>(result.content, 'OCR');
  }
}
