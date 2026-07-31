import { randomUUID } from 'node:crypto';
import { Prisma, type TenantScopedPrismaClient } from '@platform/database';
import type { AiRouter } from '@platform/ai';
import type { VectorSearchPort, VectorSearchResult } from '../domain/vector-search-port';
import { toVectorLiteral } from '../domain/vector-literal';

/**
 * The first real `VectorSearchPort` implementation — see docs/DOMAIN_MODEL_PHASE6.md §7.
 * `document_embeddings` has no `company_id` column of its own (it's a pure child of
 * `documents`, like `InventoryBatch` is of `InventoryItem`), so it is NOT in
 * TENANT_SCOPED_MODELS and the Prisma tenant extension does not (and cannot) auto-scope
 * queries against it — every raw query here joins through `documents` and filters by
 * `company_id` by hand.
 */
export class PgVectorSearchProvider implements VectorSearchPort {
  constructor(
    private readonly prisma: TenantScopedPrismaClient,
    private readonly router: Pick<AiRouter, 'embed'>,
  ) {}

  async indexChunk(
    companyId: string,
    documentId: string,
    chunkText: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const { embedding } = await this.router.embed(
      companyId,
      { input: chunkText },
      { purpose: 'semantic_index' },
    );
    const vectorLiteral = toVectorLiteral(embedding);
    const chunkIndex = await this.nextChunkIndex(documentId);
    const id = randomUUID();
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    const affected = await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO document_embeddings (id, document_id, chunk_index, chunk_text, metadata, embedding, created_at)
        SELECT ${id}, d.id, ${chunkIndex}, ${chunkText}, ${metadataJson}::jsonb, ${vectorLiteral}::vector, now()
        FROM documents d
        WHERE d.id = ${documentId} AND d.company_id = ${companyId}
      `,
    );

    if (affected === 0) {
      throw new Error(
        `PgVectorSearchProvider.indexChunk: no Document ${documentId} found for company ${companyId} — refusing to index a chunk against a document outside the caller's tenant.`,
      );
    }
  }

  async similaritySearch(
    companyId: string,
    query: string,
    topK: number,
  ): Promise<VectorSearchResult[]> {
    const { embedding } = await this.router.embed(
      companyId,
      { input: query },
      { purpose: 'semantic_query' },
    );
    const vectorLiteral = toVectorLiteral(embedding);

    // ivfflat is an approximate index: with the default ivfflat.probes = 1, it only searches
    // 1 of the index's `lists` (100 — see the migration) clusters, which for small-to-moderate
    // document counts can miss a real match entirely (verified: a single-row table returned
    // zero results without this). Raising probes inside a transaction (SET LOCAL, scoped to
    // this query only) trades a little query cost for actually finding matches at low-to-mid
    // row counts — see docs/DOMAIN_MODEL_PHASE6.md §7.
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL ivfflat.probes = 10`);
      return tx.$queryRaw<Array<{ document_id: string; chunk_text: string; distance: number }>>(
        Prisma.sql`
          SELECT de.document_id, de.chunk_text, de.embedding <=> ${vectorLiteral}::vector AS distance
          FROM document_embeddings de
          JOIN documents d ON d.id = de.document_id
          WHERE d.company_id = ${companyId}
          ORDER BY de.embedding <=> ${vectorLiteral}::vector ASC
          LIMIT ${topK}
        `,
      );
    });

    return rows.map((row) => ({
      documentId: row.document_id,
      chunkText: row.chunk_text,
      score: 1 - Number(row.distance),
    }));
  }

  private async nextChunkIndex(documentId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ max: number | null }>>(
      Prisma.sql`SELECT MAX(chunk_index) as max FROM document_embeddings WHERE document_id = ${documentId}`,
    );
    return (rows[0]?.max ?? -1) + 1;
  }
}
