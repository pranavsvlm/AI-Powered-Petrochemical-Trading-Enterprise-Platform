import { NotImplementedInPhaseError } from '@platform/core';

export interface ProductExpertQuery {
  productId: string;
  question: string;
}

export interface ProductExpertAnswer {
  answer: string;
  confidence: number;
}

/** See docs/DOMAIN_MODEL_PHASE4.md — no AI Product Expert provider exists yet; this is a typed seam. */
export interface AiProductExpertProvider {
  ask(query: ProductExpertQuery): Promise<ProductExpertAnswer>;
}

export class NotImplementedAiProductExpertProvider implements AiProductExpertProvider {
  // `async` deliberately — see the identical comment on NotImplementedVectorSearchProvider in
  // packages/search: a non-async method typed `Promise<T>` but throwing synchronously breaks
  // callers that don't already sit inside an await (Promise.all, .catch(), etc.).
  async ask(): Promise<ProductExpertAnswer> {
    throw new NotImplementedInPhaseError('AI Product Expert', 'Phase 6+');
  }
}
