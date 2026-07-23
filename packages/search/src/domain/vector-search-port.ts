import { NotImplementedInPhaseError } from '@platform/core';

export interface VectorSearchResult {
  documentId: string;
  chunkText: string;
  score: number;
}

/**
 * The single shared semantic-search port — see docs/DOMAIN_MODEL_PHASE3.md §4. No module
 * may build its own embedding pipeline; everything routes through this interface, whose
 * first real implementation lands with the Knowledge Management phase.
 */
export interface VectorSearchPort {
  indexChunk(
    companyId: string,
    documentId: string,
    chunkText: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;

  similaritySearch(companyId: string, query: string, topK: number): Promise<VectorSearchResult[]>;
}

export class NotImplementedVectorSearchProvider implements VectorSearchPort {
  // Declared `async` deliberately, not just typed `Promise<T>` — an `async` method turns a
  // synchronous `throw` into a real rejected promise, so `await`-less callers (Promise.all,
  // .catch(), a bare `.rejects` assertion) see a rejection rather than an uncaught
  // synchronous exception. A non-async method that types itself `Promise<T>` but throws
  // synchronously silently breaks that contract.
  async indexChunk(): Promise<void> {
    throw new NotImplementedInPhaseError('Vector / semantic search', 'Knowledge Management phase');
  }

  async similaritySearch(): Promise<VectorSearchResult[]> {
    throw new NotImplementedInPhaseError('Vector / semantic search', 'Knowledge Management phase');
  }
}
