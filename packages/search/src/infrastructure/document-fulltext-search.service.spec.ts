import { DocumentFullTextSearchService } from './document-fulltext-search.service';
import type { TenantScopedPrismaClient } from '@platform/database';

describe('DocumentFullTextSearchService', () => {
  it('returns [] without querying Postgres for an empty/whitespace query', async () => {
    const queryRaw = jest.fn();
    const prisma = { $queryRaw: queryRaw } as unknown as TenantScopedPrismaClient;
    const service = new DocumentFullTextSearchService(prisma);

    expect(await service.search('co1', '   ')).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('queries Postgres and maps rank to a number for a real query', async () => {
    const queryRaw = jest.fn().mockResolvedValue([
      { id: 'doc1', rank: 0.42 },
      { id: 'doc2', rank: 0.1 },
    ]);
    const prisma = { $queryRaw: queryRaw } as unknown as TenantScopedPrismaClient;
    const service = new DocumentFullTextSearchService(prisma);

    const result = await service.search('co1', 'invoice', { limit: 5, offset: 0 });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: 'doc1', rank: 0.42 },
      { id: 'doc2', rank: 0.1 },
    ]);
  });

  it('defaults limit to 20 and offset to 0 when not specified', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = { $queryRaw: queryRaw } as unknown as TenantScopedPrismaClient;
    const service = new DocumentFullTextSearchService(prisma);

    await service.search('co1', 'invoice');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
