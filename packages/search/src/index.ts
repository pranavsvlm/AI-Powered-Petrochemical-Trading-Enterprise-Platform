export const PACKAGE_NAME = '@platform/search';

export type { VectorSearchPort, VectorSearchResult } from './domain/vector-search-port';
export { NotImplementedVectorSearchProvider } from './domain/vector-search-port';

export { DocumentFullTextSearchService } from './infrastructure/document-fulltext-search.service';
export type {
  FullTextSearchHit,
  FullTextSearchOptions,
} from './infrastructure/document-fulltext-search.service';

export { SearchService } from './application/search.service';
export type { SearchMode, SearchFilters } from './application/search.service';

export { PgVectorSearchProvider } from './infrastructure/pgvector-search.service';
export { toVectorLiteral } from './domain/vector-literal';
