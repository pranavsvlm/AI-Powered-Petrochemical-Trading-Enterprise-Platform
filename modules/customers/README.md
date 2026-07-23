# @modules/customers

Customer relationship records and lifecycle (doc 11): profile, contacts, credit terms,
segmentation, activity notes, and an audit-log-backed timeline (`getTimeline` reads `AuditLog`
filtered by `entityType='Customer'` rather than a bespoke timeline table).

Approval (for accounts flagged `PENDING_APPROVAL`) is **delegated to `@platform/rules-engine`**
(`ApprovalEvaluator.evaluateApproval`), never reimplemented here. AI Customer Profile analysis is
out of scope — see `docs/DOMAIN_MODEL_PHASE4.md`.

## Structure

Follows the platform module contract (see docs/03_Monorepo_Architecture.md):

- `api/` — module-facing API surface (controllers/routes)
- `application/` — use cases / application services
- `domain/` — domain entities and business rules
- `infrastructure/` — persistence and external integrations
- `ui/` — module UI components
- `hooks/` — frontend hooks
- `store/` — client-side state management
- `tests/` — module tests
- `docs/` — module-specific documentation

No module may directly depend on another module's internals.
