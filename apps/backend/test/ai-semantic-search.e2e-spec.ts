/**
 * Real semantic search over pgvector via local Ollama embeddings (docs/DOMAIN_MODEL_PHASE6.md
 * §7) — no mocks. Indexes real document chunks (real Ollama embedding calls, real pgvector
 * inserts), then proves SearchService(mode:'semantic') finds and ranks the relevant chunk
 * above an irrelevant one.
 *
 * Requires DATABASE_URL and a local Ollama daemon with `nomic-embed-text` pulled.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import {
  SearchService,
  DocumentFullTextSearchService,
  PgVectorSearchProvider,
} from '@platform/search';
import { buildAiRouter } from '../src/common/ai/ai-factory';

const db = getPrismaClient();
const rawDb = new PrismaClient();

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

function asCompany<T>(companyId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

describe('AI semantic search (live Postgres/pgvector + local Ollama)', () => {
  let companyId: string;
  let userId: string;
  let relevantDocId: string;
  let irrelevantDocId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-AI-SEARCH-${Date.now()}`,
          legalName: 'AI Search Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    const user = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'Search',
          lastName: 'Tester',
          email: `search-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    await withoutTenant(() =>
      rawDb.aiProviderConfig.create({
        data: {
          companyId,
          provider: 'OLLAMA',
          enabled: true,
          isDefault: true,
          priority: 0,
          defaultEmbedModel: 'nomic-embed-text',
        },
      }),
    );

    const relevantDoc = await withoutTenant(() =>
      rawDb.document.create({
        data: {
          companyId,
          module: 'products',
          entityType: 'Product',
          title: 'Benzene safety data sheet',
          ownerUserId: userId,
        },
      }),
    );
    relevantDocId = relevantDoc.id;

    const irrelevantDoc = await withoutTenant(() =>
      rawDb.document.create({
        data: {
          companyId,
          module: 'company',
          entityType: 'Company',
          title: 'Office holiday calendar',
          ownerUserId: userId,
        },
      }),
    );
    irrelevantDocId = irrelevantDoc.id;
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.$executeRawUnsafe(
        `DELETE FROM document_embeddings WHERE document_id IN ($1, $2)`,
        relevantDocId,
        irrelevantDocId,
      );
      await rawDb.document.deleteMany({ where: { companyId } });
      await rawDb.aiProviderConfig.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('indexes real chunks via real Ollama embeddings and ranks the semantically relevant one first', async () => {
    const router = buildAiRouter(db);
    const vectorSearch = new PgVectorSearchProvider(db, router);

    await asCompany(companyId, userId, () =>
      vectorSearch.indexChunk(
        companyId,
        relevantDocId,
        'Benzene has a flash point of -11°C and is highly flammable. Store away from ignition sources.',
      ),
    );
    await asCompany(companyId, userId, () =>
      vectorSearch.indexChunk(
        companyId,
        irrelevantDocId,
        'The office will be closed on public holidays. Please submit leave requests two weeks in advance.',
      ),
    );

    const searchService = new SearchService(new DocumentFullTextSearchService(db), vectorSearch);
    const results = await asCompany(companyId, userId, () =>
      searchService.search(
        companyId,
        'What is the flash point and flammability of the chemical?',
        { limit: 5 },
        'semantic',
      ),
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe(relevantDocId);

    const relevantResult = results.find((r) => r.id === relevantDocId);
    const irrelevantResult = results.find((r) => r.id === irrelevantDocId);
    expect(relevantResult).toBeDefined();
    if (irrelevantResult) {
      expect(relevantResult!.rank).toBeGreaterThan(irrelevantResult.rank);
    }
  }, 60000);
});
