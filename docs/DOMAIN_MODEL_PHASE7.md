# Phase 7 Domain Model — Ratified Decisions

Phase 7 on the standing roadmap bundles four modules — HR (doc 15), Communication (doc 19), Analytics
(doc 20), Tasks (doc 25) — each individually comparable in size to a past full phase. Per the user's
explicit sequencing decision, they are being built **one at a time**, not all at once; this document grows
one numbered section-group per sub-module as each lands, the same way `DOMAIN_MODEL_PHASE2.md` covered four
sub-systems (Event Bus/Rules/Workflow/Notifications) in one file. This first pass covers only **Tasks**.

## Task & Project Management (doc 25) — Phase 7a

### 1. Scope: what doc 25 actually asked for vs. what shipped

Doc 25 lists 10 entities and features up to Gantt charts and recurring task templates — a wishlist, same as
every spec doc before it. Scoping down, matching every prior phase's discipline of shipping a coherent
working slice over full literal coverage:

**Shipped**: `Task` (priority/status/assignee/due-start dates, comments, a checklist, and the
event-sourced `sourceModule`/`sourceEntityType`/`sourceEntityId` linkage — see §3), `Project` (members,
milestones), `TimeEntry` (start/stop timer + manual entry). The real `TaskGenerationRequested` consumer —
see §3, the reason this sub-module was built first.

**Deferred, not silently dropped** — see §14.

### 2. Schema: entity collapses and the "plain scalar, not a relation" pattern

`TaskComment`/`TaskChecklist` are pure children of `Task`; `ProjectMember`/`ProjectMilestone` are pure
children of `Project` — same reasoning `RfqLineItem`/`ToolExecution` already established (excluded from
`TENANT_SCOPED_MODELS`, reached only via their parent). `Task`/`Project`/`TimeEntry` are the three real
tenant-scoped aggregates, added to `TENANT_SCOPED_MODELS`.

**No `TaskActivity` table** — a deliberate collapse onto the existing shared `AuditLog`, the same
precedent every business-module phase since Phase 4 has followed (only the generic engine phases —
Rule/Workflow/Document — got a dedicated audit table). New `AuditEventType` members added:
`TASK_CREATED`, `TASK_UPDATED`, `TASK_ASSIGNED`, `TASK_STATUS_CHANGED`, `TASK_COMPLETED`,
`TASK_REASSIGNED`, `AI_TASK_GENERATED`, `PROJECT_CREATED`, `TIME_LOGGED` — matches doc 25's own "Audit
Events" list. `AuditLog.eventType` is already a plain `String` column (not a Prisma enum), so no migration
was needed for the enum addition itself, only for the new tables.

**`companyId`/`assigneeUserId`/`assigneeTeamId`/`createdByUserId`/`ownerUserId`/`userId` are plain scalar
columns on `Task`/`Project`/`TimeEntry`, not Prisma relations to `Company`/`User`/`Team`** — this is not a
shortcut invented for this phase, it matches precedent already set twice: `Event.companyId` and
`WorkflowTask.assigneeUserId`/`assigneeTeamId` (both plain scalars, no `@relation`). The comment on `model
Company` in `schema.prisma` explains why directly: "Phase 2 back-relations intentionally omitted...
Event/Rule/Workflow/Notification models reference companyId as a plain scalar column... since Company
already has a very large fan-out." Tenant isolation for these fields is enforced by the tenant-extension +
`TenantContextStore`, never a DB foreign key — consistent with how every cross-module business reference in
this codebase works (validated at the service layer via a lookup port, not a raw FK).

`Task.projectId` and `Task.ruleExecutionId` **are** real Prisma relations (`onDelete: SetNull`) — these are
intra-engine references (`Project` is this same module's own aggregate; `RuleExecution` is the
already-established Rules Engine aggregate that legitimately gets back-relations appended by later phases,
same as `DocumentApproval`/`ApprovalRequest` already did).

### 3. The `TaskGenerationRequested` consumer — the reason Tasks was built first

`packages/rules-engine`'s `GENERATE_TASK` rule action has published a `TaskGenerationRequested` event via
the real `RedisStreamsEventBus` since Phase 2 (`rule-action-executor.ts`), with **zero consumers** until
this phase — `DOMAIN_MODEL_PHASE2.md` §5 said outright "A future Task module is expected to subscribe to
this topic." `modules/tasks/infrastructure/task-generation-requested.subscriber.ts` is that consumer,
built to the exact template `packages/notifications`' `registerWorkflowApprovalRequestedSubscriber`
already established: a plain exported async function taking `(eventBus, taskService)`, calling
`eventBus.subscribe<TaskGenerationRequestedPayload>(...)`, returning the unsubscribe function. Registered
in `apps/backend/src/workers/worker.ts` alongside the existing approval-notify subscriber (same
SIGTERM/SIGINT shutdown-hook pattern). Not scoped to a single company — this worker process serves every
tenant — so the write inside the handler is wrapped in `TenantContextStore.run({ companyId:
envelope.companyId, ... })`, matching `WorkflowTriggerScheduler.runWorkflow`'s exact pattern for
event-driven, cross-tenant writes. `apps/backend/test/tasks-event-consumption.e2e-spec.ts` proves this
against real Postgres + real Redis: publishes a real event through the real event bus, and asserts a real
`Task` row is created with the right `sourceModule`/`sourceEntityId` — not just that the code compiles.

**The event's payload is now typed for real** — it was previously an untyped object literal
(`Record<string, unknown>` flowing through `action.params`). `TaskGenerationRequestedPayload` now lives in
`packages/event-bus/src/domain/event-payloads.ts`, not next to either the publisher or the consumer —
deliberately, since both `packages/rules-engine` (publisher) and `modules/tasks` (consumer) need to import
the same type, and `packages/*` must never depend on `modules/*` (the rule Phase 6 §9 established), so the
shared type has to live in a `packages/*` package both sides can reach. Events with only one real side so
far (e.g. `WorkflowApprovalRequestedPayload`) keep a locally-defined payload type at that one side instead
— this shared-file pattern is only for events with real publishers and consumers on both `packages/*` and
`modules/*` sides.

**Doc/code correction**: `DOMAIN_MODEL_PHASE2.md` §5 documented the payload shape as including an
`executionId` field. The real, live publish call (`rule-action-executor.ts`) never actually included one —
confirmed by reading the code directly, not assumed. `TaskGenerationRequestedPayload` matches the real
payload (`ruleId, companyId, assigneeUserId?, assigneeTeamId?, title, description?, dueDate?, sourceModule,
sourceEntityId?`); the doc's `executionId` mention was drift, not a hidden requirement, and is called out
here rather than silently added to the type.

### 4. No-hard-delete convention

`DELETE /tasks/:id` archives (`status: ARCHIVED`) rather than issuing a real SQL `DELETE` — the same
convention every other module in this platform already follows (Customer/Product/Quotation/Order statuses,
no raw deletes anywhere). Doc 25 literally lists `DELETE /tasks/{id}` in its REST API section; the route
exists at that path, it just never removes the row.

### 5. No approval integration in `TaskService`

Unlike Customer/Product/Quotation, doc 25 has no "task requires approval" language anywhere. `TaskService`
has no `ApprovalEvaluator`/Rules-Engine dependency — a deliberate simplification, not an oversight.

### 6. Status-transition rules

`domain/task-status.ts`'s `isValidStatusTransition` encodes the Kanban board order from doc 25
(Backlog → Planned → In Progress → Review → Completed → Archived) as the forward path, plus two real
business allowances doc 25's board diagram doesn't spell out but any real usage needs: a reviewer can send
work back a step (Review → In Progress), and a completed task can be reopened (Completed → In
Progress/Review). Archiving is reachable from any non-terminal status. `ARCHIVED` is terminal — no
transition out of it exists, matching §4's "archive, don't delete" semantics (an archived task is meant to
stay archived, not be silently revived by a stray status update).

### 7. RBAC

Single module string `'tasks'` covers `Task`+`Project`+`TimeEntry` — doc 25 frames "Task & Project
Management" as one module, and its own Permissions list (View/Create/Assign Tasks, Manage Projects, Track
Time, Use AI Task Assistant) collapses onto the existing 12-value `PermissionAction` enum with no new
actions needed, same as every prior phase. `PHASE7_MODULES = ['tasks']` in
`packages/permissions/src/rbac/seed-data.ts` — named for the whole phase, not just this sub-module, since
Communication/Analytics/HR append to the same array in their own later sub-phases rather than each minting
a new `PHASE7x_MODULES` array.

### 8. REST surface

```
GET/POST   /tasks                          [tasks:view / tasks:create]
PUT        /tasks/:id                      [tasks:edit]
DELETE     /tasks/:id                      [tasks:edit]   — archives, see §4
POST       /tasks/:id/comments             [tasks:edit]
POST       /tasks/:id/checklist-items      [tasks:edit]
PUT        /tasks/:id/checklist-items/:id  [tasks:edit]
POST       /tasks/:id/status               [tasks:edit]
POST       /tasks/:id/assign               [tasks:edit]
GET/POST   /projects                       [tasks:view / tasks:create]
GET        /projects/:id                   [tasks:view]
POST       /projects/:id/members           [tasks:edit]
POST       /projects/:id/milestones        [tasks:edit]
POST       /projects/milestones/:id/complete [tasks:edit]
POST       /time-entries/start             [tasks:create]
POST       /time-entries/:id/stop          [tasks:edit]
POST       /time-entries                   [tasks:create]  — manual entry
GET        /time-entries                   [tasks:view]
```

`TasksController`/`ProjectsController`/`TimeEntriesController` all follow the exact `useFactory` NestJS
wiring pattern `products.module.ts` established (`AuditService` injected via DI, the module's own
`*Service` classes constructed with `prisma.client` + `audit` — no Rules Engine/event-bus composition
needed here, unlike `ProductsModule`, since `TaskService` has neither an approval flow nor a direct
publish-side event dependency of its own).

### 9. Time tracking

A user may only have one running timer at a time per company — `TimeEntryService.start()` checks for an
existing `endedAt: null` row for that `(companyId, userId)` pair and rejects a second one with a clear
error rather than silently letting two timers overlap (doc 25 lists "Start Timer / Stop Timer" without
addressing concurrency; this is the ratified answer). `computeDurationMinutes` rounds **down** to the
nearest whole minute — never rounds up, so tracked time is never overcharged — and throws
`InvalidTimeEntryError` if given an end before its start (a manual-entry input-validation guard, not
expected to ever fire from the real `stop()` path since that always uses `new Date()` as the end).

### 10. AI Task Assistant — no new agent this phase

Doc 25's "AI can create tasks automatically" is satisfied end-to-end by §3's real event consumption: any
Rules Engine rule — including one whose condition was itself informed by Phase 6's `CALL_AI` action — can
fire `GENERATE_TASK`, and a real `Task` row results. No new `packages/ai` agent or `tasks.create`/
`tasks.assign` tool binding was built this phase. Adding those tool bindings for a future agent (e.g. so
the Sales or Inventory agent could create a task directly mid-conversation) is a zero-architecture-change
addition later — the same "pluggable later" framing `DOMAIN_MODEL_PHASE6.md` §12/§14 used for every
doc-26-named agent it didn't build.

### 11. Desktop UI

Same low-ceremony pattern as every existing module (plain tables, `.card`/`.button-row`/`.pill`, no new
CSS) — see the follow-up UI plan/commit for the page list. Status changes go through a button/dropdown, not
drag-and-drop — see §14.

### 12. Testing

Unit specs: `domain/task-status.spec.ts` (transition validity, including the two non-obvious real
allowances from §6), `domain/time-tracking.spec.ts` (duration rounding, the invalid-range guard). E2e specs
(`apps/backend/test/`, real Postgres/Redis):

- `tasks-lifecycle.e2e-spec.ts` — create, comment, checklist, status transitions through to COMPLETED
  (and a rejected invalid skip-ahead transition), assign, archive.
- `tasks-event-consumption.e2e-spec.ts` — **the actual bar for "real" this phase**: publishes a real
  `TaskGenerationRequested` event through the real `RedisStreamsEventBus`, runs the real subscriber,
  polls until a real `Task` row exists (same bounded-poll pattern `packages/event-bus`'s own integration
  test uses), asserts the source linkage and `createdByUserId: null` (system-generated).
- `projects-lifecycle.e2e-spec.ts` — create, members, milestone completion, a real linked `Task`, archive.
- `time-tracking.e2e-spec.ts` — start/stop with a real elapsed duration, the concurrent-timer rejection,
  the double-stop rejection, a manual entry.

### 13. Verification

Full monorepo typecheck (`pnpm --filter '!@platform/portal' -r typecheck`) and `pnpm --filter backend
build` clean on the first pass — no regressions from the `TaskGenerationRequestedPayload` type change's
ripple into `packages/rules-engine`. Full e2e suite against real Postgres/Redis/MinIO: the pre-existing
baseline unchanged, plus all 4 new specs passing.

### 14. Explicitly out of scope for Phase 7a (carried into a later pass, this phase or a future one)

- `TaskAttachment` — doc 25 lists it as one bullet among many under "Collaboration"; no acceptance
  criterion hinges on it. A `Task` can be discussed via comments; file attachment is deferred.
- `TaskTemplate` (recurring/templated task creation).
- Gantt chart — doc 25 itself labels this "Future support," not asking for it now.
- Drag-and-drop Kanban board UI — no drag-and-drop exists anywhere in `apps/desktop` yet; every page is a
  plain filterable table/list. The Kanban **columns** are real (`TaskStatus` enum values a list can filter/
  group by) — only the drag-and-drop interaction is deferred.
- A dedicated Calendar view UI — derivable from existing `dueDate` data via a filter, not a new UI surface.
- Any new `packages/ai` agent or tool bindings — see §10.
- Communication, Analytics, and HR (docs 19/20/15) — the other three Phase 7 sub-modules, each to be
  planned and built as its own follow-up pass. One naming collision already flagged for whoever builds
  Communication next: `Conversation`/`ConversationMessage` Prisma models already exist (Phase 6's
  AI-agent-conversation-memory), so doc 19's general messaging feature needs its own distinctly-named
  models to avoid a hard Prisma model-name collision.
