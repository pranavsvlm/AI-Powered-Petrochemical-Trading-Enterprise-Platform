import type {
  DocumentFullTextSearchService,
  FullTextSearchHit,
} from '../infrastructure/document-fulltext-search.service';
import type { VectorSearchPort } from '../domain/vector-search-port';

export type SearchMode = 'fulltext' | 'semantic';

export interface SearchFilters {
  limit?: number;
  offset?: number;
}

/**
 * The one facade Document Management (and later Knowledge Management) calls for
 * `POST /documents/search` — see docs/DOMAIN_MODEL_PHASE3.md §4-5. `mode: 'semantic'`
 * intentionally throws via the injected `VectorSearchPort` seam rather than silently
 * falling back to full-text, so callers can't mistake a missing feature for an empty result.
 */
export class SearchService {
  constructor(
    private readonly fullText: DocumentFullTextSearchService,
    private readonly vectorSearch: VectorSearchPort,
  ) {}

  async search(
    companyId: string,
    query: string,
    filters: SearchFilters = {},
    mode: SearchMode = 'fulltext',
  ): Promise<FullTextSearchHit[]> {
    if (mode === 'semantic') {
      const hits = await this.vectorSearch.similaritySearch(companyId, query, filters.limit ?? 20);
      return hits.map((h) => ({ id: h.documentId, rank: h.score }));
    }
    return this.fullText.search(companyId, query, filters);
  }
}
