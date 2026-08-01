# @modules/reports

Analytics & Business Intelligence (doc 20): live-computed dashboards (Executive, Sales, Trading, Finance,
Inventory, Procurement, AI) built from real Prisma `groupBy`/`aggregate` queries over existing tables — no
placeholder numbers. `AnalyticsSnapshot` persists periodic KPI captures for trend history; one real `Forecast`
type (Sales, a deterministic linear-trend projection, not an AI guess); one real `AIInsight` generator (an
AI-written business briefing over the current KPI snapshot); a 4th AI agent (Analytics Assistant,
`packages/ai/src/agent-sdk/domain/agents/analytics-agent.definition.ts`) for natural-language querying
through the existing tool-calling orchestrator; and real `Report` generation (PDF via the reused
`PdfKitDocumentGenerator` from `@platform/workflow`, CSV via a small hand-rolled serializer) stored through
Document Management, plus `ReportSchedule` for recurring delivery via real cron (`node-cron`, the same
pattern `packages/workflow`'s `WorkflowTriggerScheduler` already established) and a real email notification
linking to the stored report.

Kept the pre-existing `@modules/reports` package name (this workspace already had an empty skeleton
described as "Cross-module reporting and analytics module") rather than a new `modules/analytics` folder.
The REST and desktop-UI surface is `/analytics`, not `/reports` — doc 20's own REST API section specifies
`/analytics/*` routes, and `apps/desktop` already has a `/reports` route serving Accounting's own financial
reports page.

See `docs/DOMAIN_MODEL_PHASE7.md` (Analytics section) for the full ratified-decisions record, including
what's deliberately deferred (HR/Knowledge analytics — no data source exists yet; Cash Position/Business
Health Score — no real basis to compute them from; Balance Sheet/Aging/Tax Summary — Accounting's own job,
not built there yet either; Excel export; configurable dashboard/widget layouts; email attachments).

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

> Status: backend implemented (Phase 7c). Desktop UI pending a separate follow-up pass.
