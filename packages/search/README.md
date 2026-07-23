# @platform/search

Real PostgreSQL full-text search (`DocumentFullTextSearchService`, over a generated `tsvector` + GIN index
on `documents`) plus the single shared `VectorSearchPort` seam (`NotImplementedVectorSearchProvider` until
the Knowledge Management phase supplies a real implementation). `SearchService` is the facade callers use —
see `docs/DOMAIN_MODEL_PHASE3.md` §4-5 for the rationale (no module may build its own embedding pipeline).
