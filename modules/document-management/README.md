# @modules/document-management

Enterprise document repository (doc 21): lifecycle (Create → Upload → Version Control → Approval →
Published → Archived → Retention/Disposal), version history, exact-hash duplicate warning, folder/category/
tag organization, and full-text search — via `@platform/storage` and `@platform/search`.

Approval is **delegated to `@platform/rules-engine`** (`ApprovalEvaluator.evaluateApproval`), never
reimplemented here. OCR and semantic search are out of scope — see `docs/DOMAIN_MODEL_PHASE3.md`.
