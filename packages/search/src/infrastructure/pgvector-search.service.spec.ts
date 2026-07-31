import { PgVectorSearchProvider } from './pgvector-search.service';
import type { TenantScopedPrismaClient } from '@platform/database';
import type { AiRouter } from '@platform/ai';

function makeRouter(embedding: number[]) {
  return {
    embed: jest
      .fn()
      .mockResolvedValue({
        embedding,
        promptTokens: 5,
        provider: 'OLLAMA',
        model: 'nomic-embed-text',
      }),
  };
}

describe('PgVectorSearchProvider', () => {
  describe('indexChunk', () => {
    it('embeds the chunk, looks up the next chunk index, and inserts scoped to the document + company', async () => {
      const executeRaw = jest.fn().mockResolvedValue(1);
      const queryRaw = jest.fn().mockResolvedValue([{ max: 2 }]);
      const prisma = {
        $executeRaw: executeRaw,
        $queryRaw: queryRaw,
      } as unknown as TenantScopedPrismaClient;
      const router = makeRouter([0.1, 0.2, 0.3]);

      const provider = new PgVectorSearchProvider(prisma, router as unknown as AiRouter);
      await provider.indexChunk('company-1', 'doc-1', 'some chunk text', { page: 1 });

      expect(router.embed).toHaveBeenCalledWith(
        'company-1',
        { input: 'some chunk text' },
        { purpose: 'semantic_index' },
      );
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(executeRaw).toHaveBeenCalledTimes(1);
    });

    it('throws when the insert affects zero rows (document not found for that company)', async () => {
      const executeRaw = jest.fn().mockResolvedValue(0);
      const queryRaw = jest.fn().mockResolvedValue([{ max: null }]);
      const prisma = {
        $executeRaw: executeRaw,
        $queryRaw: queryRaw,
      } as unknown as TenantScopedPrismaClient;
      const router = makeRouter([0.1]);

      const provider = new PgVectorSearchProvider(prisma, router as unknown as AiRouter);
      await expect(provider.indexChunk('company-1', 'doc-missing', 'text')).rejects.toThrow(
        /no Document doc-missing found for company company-1/,
      );
    });
  });

  describe('similaritySearch', () => {
    it('embeds the query, raises ivfflat.probes inside a transaction, and maps cosine distance to a 1-distance similarity score', async () => {
      const queryRaw = jest.fn().mockResolvedValue([
        { document_id: 'doc-1', chunk_text: 'chunk A', distance: 0.1 },
        { document_id: 'doc-2', chunk_text: 'chunk B', distance: 0.4 },
      ]);
      const executeRaw = jest.fn().mockResolvedValue(0);
      const tx = { $executeRaw: executeRaw, $queryRaw: queryRaw };
      const transaction = jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(tx));
      const prisma = { $transaction: transaction } as unknown as TenantScopedPrismaClient;
      const router = makeRouter([0.5, 0.5]);

      const provider = new PgVectorSearchProvider(prisma, router as unknown as AiRouter);
      const result = await provider.similaritySearch('company-1', 'what is the payment term?', 5);

      expect(router.embed).toHaveBeenCalledWith(
        'company-1',
        { input: 'what is the payment term?' },
        { purpose: 'semantic_query' },
      );
      expect(executeRaw).toHaveBeenCalledTimes(1);
      expect(queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        { documentId: 'doc-1', chunkText: 'chunk A', score: 0.9 },
        { documentId: 'doc-2', chunkText: 'chunk B', score: 0.6 },
      ]);
    });
  });
});
