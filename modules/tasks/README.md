# @modules/tasks

Task & Project Management (doc 25): personal/team tasks with a Kanban-shaped status lifecycle,
comments, checklists, projects with members/milestones, and time tracking (start/stop timer +
manual entries).

The real consumer of `TaskGenerationRequested` — published by `@platform/rules-engine`'s
`GENERATE_TASK` rule action since Phase 2 with no consumer until this module. See
`docs/DOMAIN_MODEL_PHASE7.md` for ratified scope decisions (this module deliberately does not
cover `TaskAttachment`, `TaskTemplate`, Gantt charts, or a new AI agent — see §14 there for the
full out-of-scope list).

No `ApprovalEvaluator`/Rules-Engine dependency in `TaskService` — unlike Customer/Product/
Quotation, doc 25 has no "task requires approval" language.

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

> Status: backend implemented (Phase 7a). Desktop UI pending a separate follow-up pass.
