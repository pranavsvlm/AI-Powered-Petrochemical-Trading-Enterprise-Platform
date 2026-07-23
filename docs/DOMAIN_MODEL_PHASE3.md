# Phase 3 Domain Model — Ratified Decisions

Storage, Documents & Search Foundation: `packages/storage`, `packages/search`, `modules/document-management`
(doc 21), and the infrastructure substrate doc 18 (Knowledge Management) will later build on. This document
is the source of truth for Phase 3 code, the same way `DOMAIN_MODEL_PHASE1.md` and `DOMAIN_MODEL_PHASE2.md`
are for their phases.

## 1. Canonical storage folder convention (resolves doc 04 vs doc 21 conflict)

Doc 04 specifies `company-id/{products,quotations,invoices,documents,certificates}/`. Doc 21 specifies
`company-id/{finance,hr,products,quotations,contracts,trading,knowledge}/`. These are different, unreconciled
folder trees. **Decision: doc 21's module-based structure is canonical**, extended with an entity-scoped
suffix so keys are unique and collision-free without relying on random UUIDs alone:

```
{companyId}/{module}/{entityType}/{entityId}/{filename-or-uuid}
```

- `module` is one of: `finance`, `hr`, `products`, `quotations`, `contracts`, `trading`, `knowledge`, `company`.
- `entityType` is the owning domain entity, e.g. `document`, `invoice`, `product`.
- `entityId` is that entity's id (for a `Document`, its own id — the file lives "under itself" so all of a
  document's versions naturally group under `{entityId}/`).

All callers MUST go through `packages/storage`'s `buildStorageKey(companyId, module, entityType, entityId,
filename)` pure function — no module is permitted to hand-construct an R2/S3 key. This directly resolves the
architecture-review finding that doc 04 and doc 21 never agreed on one convention.

## 2. Storage provider: one adapter, two backends

`packages/storage` defines a provider-agnostic `StoragePort` (`upload`, `download`, `getSignedUrl`, `delete`,
`exists`). Cloudflare R2 is S3-API-compatible, so a single `S3StorageAdapter` (built on
`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`) serves both: production points it at R2
(`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`), local dev/test points the same class
at a MinIO container added to `docker/docker-compose.yml`. This avoids the two-adapters-for-one-behavior
duplication doc 03 warns against, and satisfies doc 03's "Future S3 Adapter" note for free (S3 itself needs
zero new code, only different env vars).

## 3. OCR seam

No OCR provider exists in Phase 3. `packages/storage` (or a document-processing concern within
`modules/document-management`) defines an `OcrProvider` port (`extractText(buffer, contentType):
Promise<{ text: string; confidence: number }>`). The shipped implementation, `NotImplementedOcrProvider`,
throws `NotImplementedInPhaseError('OCR', 'Phase 6+')` (reusing Phase 2's error class from
`packages/core/src/errors/not-implemented-in-phase.error.ts` — no second error type introduced). The upload
pipeline never calls this port automatically; it is only invoked if a caller explicitly requests OCR, so
normal uploads are unaffected by the seam's absence.

## 4. Vector search seam — the single shared port

Doc 18 frames Knowledge Management as "the foundation of every AI capability," but the original architecture
review flagged that docs 11, 12, and 21 each separately claim their own "Semantic AI Search," which would
mean duplicated embedding pipelines. **Decision: `packages/search` defines the one and only
`VectorSearchPort`** (`indexChunk(companyId, documentId, chunkText, metadata)`,
`similaritySearch(companyId, query, topK): Promise<Array<{ documentId, chunkText, score }>>`) that every
future module must call — none may embed independently. Phase 3 ships `NotImplementedVectorSearchProvider`
(throws the same `NotImplementedInPhaseError`). The Knowledge Management phase supplies the first real
implementation; Document Management's `SearchService.search(companyId, query, filters, mode)` accepts
`mode: 'fulltext' | 'semantic'` today, but `'semantic'` throws until that phase lands — it is not silently
downgraded to full-text, so callers can't mistake a missing feature for an empty result set.

## 5. Full-text search implementation

Real PostgreSQL full-text search on `Document` (filename, category, tag, and — once OCR lands — extracted
text). Implemented via a generated `tsvector` column (`search_vector`) + GIN index, added with a raw-SQL
block in the Phase 3 migration (Prisma has no native `tsvector` type). `packages/search`'s `SearchService`
wraps `to_tsquery`/`plainto_tsquery` behind a typed method; Document Management's `POST /documents/search`
calls this directly rather than each module writing its own raw SQL.

## 6. Document lifecycle & approval — no second approval system

Document approval (`DocumentApproval`) does **not** reimplement approval logic. It calls
`packages/rules-engine`'s `RulesEngineClient.evaluateApproval(...)` exactly as Phase 2's Workflow Engine does
for its `APPROVAL` node — this keeps the Rules Engine as the single canonical approval evaluator established
in `DOMAIN_MODEL_PHASE2.md` §3. `DocumentApproval` only records the resulting decision/approver chain; it is
not a second source of approval policy.

## 7. Duplicate detection — exact hash, warn not block

On upload, `packages/storage`/`modules/document-management` computes a SHA-256 hash of the buffer and checks
for an existing `Document`/`DocumentVersion` in the same company with the same hash. Doc 21 lists "Duplicate
detection" under AI Intelligence but does not specify block-vs-warn behavior; Phase 3 implements only
**exact**-hash detection (no fuzzy/semantic similarity — that would require the vector-search seam from §4,
which doesn't exist yet) and **warns** (returns a `possibleDuplicateOf` field in the upload response) rather
than blocking, consistent with doc 21's and doc 23's general pattern of flagging rather than rejecting.

## 8. `DocumentEmbedding` — schema exists, unused

Doc 21 lists `DocumentEmbedding` as one of its database entities. The table is created now (future-proofing
the schema so no destructive migration is needed later) but nothing writes to it in Phase 3 — it is wired up
once the vector-search seam (§4) gets a real implementation. Same deferred-table pattern as Phase 1's
`Employee` note.

## 9. Retention scheduling

`Document.retentionPolicyName` + `retentionExpiresAt` (nullable) are set at upload/approval time from a
per-company-configurable policy (name + duration), not hardcoded numbers (doc 21 gives no numbers; doc 38's
concrete backup-retention numbers are a separate, unrelated concern per `DOMAIN_MODEL_PHASE1.md`-era
reasoning — a document's business-record retention is independent of backup retention). A scheduled check
is added to the existing `apps/backend/src/scheduler/scheduler.ts` process (not a new scheduler) that flags
documents past `retentionExpiresAt` for archival on a fixed interval, matching the polling pattern Phase 2
already established for workflow triggers.

## 10. Explicitly out of scope for Phase 3 (carried into later phases)

- OCR execution (seam only, §3).
- Vector search / embeddings / RAG (seam only, §4).
- AI Document Assistant, AI Knowledge Assistant (summarize, extract clauses, answer questions).
- Full Knowledge Management module (`KnowledgeCategory`, `KnowledgeCollection`, etc.) — only its shared
  storage/search substrate is built now.
- Fuzzy/semantic duplicate detection (exact-hash only, §7).
- Watermarking (doc 21 marks this "future" explicitly).
