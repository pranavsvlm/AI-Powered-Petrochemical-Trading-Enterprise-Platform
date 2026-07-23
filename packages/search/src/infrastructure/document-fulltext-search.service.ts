import { Prisma, type TenantScopedPrismaClient } from '@platform/database';

export interface FullTextSearchHit {
  id: string;
  rank: number;
}

export interface FullTextSearchOptions {
  limit?: number;
  offset?: number;
}

/**
 * Real PostgreSQL full-text search over the `documents` table's generated `search_vector`
 * column (tsvector + GIN index, added by the Phase 3 migration's raw-SQL block — Prisma has
 * no native tsvector type). See docs/DOMAIN_MODEL_PHASE3.md §5.
 *
 * Deliberately knows nothing about `modules/document-management`'s Document entity shape —
 * packages/* must not depend on modules/* (doc 03's dependency rule) — it returns bare
 * `{ id, rank }` hits; callers hydrate full records from their own repository.
 */
export class DocumentFullTextSearchService {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  async search(
    companyId: string,
    query: string,
    options: FullTextSearchOptions = {},
  ): Promise<FullTextSearchHit[]> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    if (!query.trim()) return [];

    const rows = await this.prisma.$queryRaw<Array<{ id: string; rank: number }>>(
      Prisma.sql`
        SELECT id, ts_rank(search_vector, plainto_tsquery('english', ${query})) AS rank
        FROM documents
        WHERE company_id = ${companyId}
          AND search_vector @@ plainto_tsquery('english', ${query})
        ORDER BY rank DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
    );

    return rows.map((row) => ({ id: row.id, rank: Number(row.rank) }));
  }
}
