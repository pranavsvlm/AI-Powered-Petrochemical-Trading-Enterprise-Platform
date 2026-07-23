import { NotImplementedInPhaseError } from '@platform/core';

export interface OcrResult {
  text: string;
  confidence: number;
}

/** See docs/DOMAIN_MODEL_PHASE3.md §3 — no OCR provider exists yet; this is a typed seam. */
export interface OcrProvider {
  extractText(buffer: Buffer, contentType: string): Promise<OcrResult>;
}

export class NotImplementedOcrProvider implements OcrProvider {
  // `async` deliberately — see the identical comment on NotImplementedVectorSearchProvider
  // in packages/search: a non-async method typed `Promise<T>` but throwing synchronously
  // breaks callers that don't already sit inside an await (Promise.all, .catch(), etc.).
  async extractText(): Promise<OcrResult> {
    throw new NotImplementedInPhaseError('OCR', 'Phase 6+');
  }
}
