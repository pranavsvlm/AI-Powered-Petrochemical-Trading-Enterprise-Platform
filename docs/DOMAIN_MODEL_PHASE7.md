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

## Communication Management (doc 19) — Phase 7b

### 1. Scope: what doc 19 actually asked for vs. what shipped

Doc 19 is the widest-scoped of Phase 7's four sub-modules: a unified omnichannel messaging hub (WhatsApp/
Email/SMS/Push), an AI Receptionist, internal team chat with @mentions, a cross-entity CRM Timeline, and its
own communication analytics. Scoped down the same way every phase before it has:

**Shipped**: a real messaging core — `CommsThread` (customer/supplier/internal/announcement) with
`CommsParticipant`s (internal users or external contacts) and `CommsMessage`s. Two real send channels,
**IN_APP** and **EMAIL**, reusing Phase 1/2's already-real infrastructure (`EmailSenderPort`, no new email
code); WhatsApp/SMS/Push remain typed seams, throwing the platform's existing `ChannelNotAvailableError` —
not a new error type. Attachments reuse Document Management's existing generic `entityType`/`entityId`
pattern — no new attachment table. Two cross-module integrations (see §5): a real CRM Timeline entry
(`CustomerActivity`, `type: MESSAGE`) for customer-linked threads, and real `Task` creation from a thread via
the existing `TaskGenerationRequested` event.

**Deferred, not silently dropped** — see §9.

### 2. Naming: avoiding the `Conversation`/`ConversationMessage` collision

`Conversation`/`ConversationMessage` already exist in the schema — Phase 6's AI-agent chat-transcript storage
(`agentId`, tied to `AgentExecution`, token-count fields), a different concern from human/business messaging.
New models are deliberately prefixed `Comms*` — `CommsThread`, `CommsParticipant`, `CommsMessage` — a
self-documenting choice most modules don't need but this one earns given the adjacent, easily-confused Phase
6 models. Verified no model named `Message`, `Thread`, `Channel`, or `Participant` exists anywhere else in
the schema either.

### 3. Schema

New enums: `CommsThreadType` (CUSTOMER/SUPPLIER/INTERNAL/ANNOUNCEMENT), `CommsThreadStatus`
(ACTIVE/CLOSED), `CommsMessageDirection` (INBOUND/OUTBOUND). `CommsMessage.channel` reuses the **existing**
`NotificationChannel` enum (EMAIL/IN_APP/WHATSAPP/SMS/PUSH) rather than minting a duplicate — a message
channel and a notification channel are the same underlying concept (the transport medium), and this is the
same enum Phase 2 already built the real/seam adapter split for.

`CommsThread` (real tenant-scoped aggregate, added to `TENANT_SCOPED_MODELS`): `companyId`, `type`, `status`
(default ACTIVE), `subjectType: String?`/`subjectId: String?` (free-form, no FK — mirrors `Conversation`'s
own existing precedent exactly, not a new pattern), `title?`, `createdByUserId?`. `CommsParticipant`/
`CommsMessage` are pure children (excluded from `TENANT_SCOPED_MODELS`, reached only via their parent thread
— same reasoning as `TaskComment`/`ProjectMember` in §2 above). `externalIdentifier` on `CommsParticipant`
is free text (no FK/lookup validation), same no-lookup-validation reasoning as `subjectId`.

New `AuditEventType` members: `COMMS_THREAD_CREATED`, `COMMS_MESSAGE_SENT`, `COMMS_PARTICIPANT_ADDED` —
matching doc 19's own "Audit Events" list where it maps onto real scope (Message Deleted, Attachment
Uploaded — already covered by Phase 3's own audit events, Conversation Assigned, AI Reply Generated,
Notification Delivered — already covered by Phase 2's own audit events — are all deferred or already
handled elsewhere, not re-invented here).

One small addition to an existing Phase 4 model: `ActivityType` (used by `modules/customers`'
`CustomerActivity`) gains a `MESSAGE` member — the concrete mechanism behind §5's CRM-timeline integration.

### 4. Real channel sending — reusing Phase 1/2's infra, not rebuilding it

`CommsService.sendMessage()` gates on `input.direction === 'OUTBOUND'` only: `isRealChannel(channel)` (a
pure function in `domain/comms-channel.ts`, checking membership in `{EMAIL, IN_APP}`) throws
`ChannelNotAvailableError` immediately for WHATSAPP/SMS/PUSH, before anything is persisted — fail fast,
matching "don't fake it." **INBOUND messages are never gated** — recording a message that already arrived
via some external channel (e.g. a WhatsApp reply relayed in by a future webhook) is data entry, not
dispatch, and doc 19 itself treats inbound receipt and outbound send as different capabilities.

**A design correction made during implementation, not part of the original plan**: the plan's first draft
assumed `NotificationService` (Phase 2) could be the single dispatch path for all real channels, with
WhatsApp/SMS throwing through it. Reading `NotificationService.send()` in full showed it **catches and
swallows** per-channel adapter errors internally — it records a `FAILED` `NotificationDelivery` row and
returns normally, it never rethrows. Routing the channel-gating requirement through it would have silently
broken the "WhatsApp throws" contract. Fixed by separating concerns: `EmailSenderPort` is injected directly
into `CommsService` and used for real EMAIL sends (calling `NotificationService` for EMAIL would have gone
through the exact same swallow-the-error path); `isRealChannel()` + a direct `throw` handles the gate;
`NotificationService`, via the narrow `CommsNotificationPort`, is used only for the separate, legitimately
best-effort "let the other internal participants know a message arrived" concern — where swallowing failures
is the correct behavior, not a bug to route around.

**A second gap caught during desktop UI browser-verification, not the original plan**: `ChannelNotAvailableError` had never actually crossed an HTTP boundary anywhere in this codebase before — `NotificationService.send()` always catches and swallows it internally (§4), so `apps/backend/src/common/filters/global-exception.filter.ts` had no branch for it and fell through to a generic 500 "An unexpected error occurred," losing the real message. `CommsService.sendMessage()` is the first place a service throws it and expects it to reach an HTTP caller. Fixed by adding a `ChannelNotAvailableError → 400 Bad Request` branch to the shared `GlobalExceptionFilter`, reusing its existing `instanceof`-branching structure (same shape as its `Prisma.PrismaClientKnownRequestError` handling) rather than a new filter. Verified via the real browser round-trip (Playwright driving the actual desktop UI against the actual running backend) rather than a new automated HTTP test, since no e2e spec in this codebase boots a real HTTP server — every existing e2e spec, including this phase's own three, exercises services directly; adding a supertest-based HTTP harness for one filter branch would be new test infrastructure disproportionate to the fix.

### 5. Two cross-module integrations, both narrow ports wired at the composition root

Same pattern `modules/quotations` already established for `CustomerLookupPort`/`ProductLookupPort`: the
consuming module declares its own narrow port interface, never imports another module's service directly;
the port is satisfied only inside `apps/backend/src/modules/comms/comms.module.ts`'s `useFactory`.

1. **CRM Timeline**: `CustomerActivityPort { record(customerId, type, body, authorUserId): Promise<void> }`,
   satisfied by `CustomerService.addActivity` (already exists, unchanged). Called only when
   `thread.subjectType === 'Customer'` — a no-op for every other thread type, including the scoped-down
   version of doc 19's much larger "Customer + Contact + Quotation + Order + Invoice + Shipment + Product"
   timeline ask.
2. **Task creation from a thread**: `CommsService.createTaskFromThread()` publishes the **existing**
   `EVENT_TYPES.TASK_GENERATION_REQUESTED` (typed via `TaskGenerationRequestedPayload`, defined in Phase 7a)
   with `sourceModule: 'communication'`, `ruleId: 'manual:<actorUserId>'` (a documented placeholder — no
   real `RuleExecution` triggered this, a human clicked "create task" on a thread, but the payload's
   `ruleId` field is non-optional since every other publisher is a real rule). Phase 7a's already-running
   `registerTaskGenerationRequestedSubscriber` picks it up with **zero new code on the Tasks side** — a
   direct payoff of the event-bus architecture. `apps/backend/test/comms-task-creation.e2e-spec.ts` proves
   this real cross-phase path end to end, not just that the event gets published.

### 6. Attachments — zero new schema, reusing Document Management's existing generic pattern

`modules/document-management`'s `Document` model already has `module`/`entityType`/`entityId` fields, a
generic-attachment mechanism already designed for exactly this reuse case. A message attachment is a
`Document` row with `entityType: 'CommsMessage'`, `entityId: <messageId>`, uploaded through the **existing**
`/documents` REST surface. `CommsService` has no `StoragePort` dependency at all.

### 7. RBAC

Single module string `'communication'`; doc 19's Permissions list (View/Manage Conversations, Send/Delete
Messages, Broadcast Messages, Manage Channels, Use AI Assistant, Manage Notifications) collapses onto the
existing `PermissionAction` enum with no new actions, same as every prior phase. Appended to the existing
`PHASE7_MODULES` array (`['tasks', 'communication']`) in `packages/permissions/src/rbac/seed-data.ts`, per
§7's own documented intent in the Tasks section above, rather than minting a new array.

### 8. REST surface

```
GET/POST   /comms/threads                    [communication:view / communication:create]
GET        /comms/threads/:id                [communication:view]
POST       /comms/threads/:id/participants   [communication:edit]
GET        /comms/threads/:id/messages       [communication:view]
POST       /comms/threads/:id/messages       [communication:create]  — real for EMAIL/IN_APP, throws for WHATSAPP/SMS/PUSH
POST       /comms/threads/:id/close          [communication:edit]
POST       /comms/threads/:id/create-task    [communication:create]  — publishes TaskGenerationRequested
```

One `CommsController` at `@Controller('comms/threads')` — unlike Tasks' 3-controller split (justified there
by Task/Project/TimeEntry being genuinely separate aggregates), Message/Participant here are pure children
of Thread, so a single controller matches the aggregate shape. `CommsModule` follows `quotations.module.ts`'s
exact `useFactory` pattern (port adapters constructed inside the factory, injected via `inject: [...]`), and
`notifications.controller.ts`'s exact `ChannelAdapterRegistry` + env-var-gated email adapter construction
block for the real `EmailSenderPort`/`NotificationService` instances.

### 9. Explicitly out of scope for Phase 7b (carried into a later pass, this phase or a future one)

- **AI Receptionist** — doc 19's headline AI feature. Mechanically cheap (a 4th `AgentDefinition` plus tool
  bindings in `ai.module.ts`'s hand-written tool-handler map), but the real cost is the same "build the real
  core an agent would act on, first" reasoning Phase 6 used for its own 9 unbuilt agents and Phase 7a used
  for its own task-assistant — see Tasks §10. The real thread/message core this phase ships is exactly that
  substrate.
- **Real WhatsApp Business API integration** — zero scaffolding exists anywhere in this repo (no SDK, no
  webhook handler, no env vars, no access-token config), no credentials available. Follows the exact seam
  Phase 2 already built for `NotificationChannel.WHATSAPP`, not a new pattern.
- **Conversation Assignment** (routing a thread to a specific rep/agent) and **Broadcast/Announcement
  scheduling** — `CommsThreadType.ANNOUNCEMENT` exists as a thread type (a broadcast is just a thread with
  many participants), but no scheduling/audience-targeting logic is built.
- **@mentions** — needs a user-search/autocomplete UI this app has no precedent for yet. Messages remain
  plain text.
- **Communication Analytics** (response time, resolution time, AI automation rate) — doc 20's own territory
  (the next-but-one Phase 7 sub-module), not Communication's job to duplicate.
- **File attachment UI** — the backend supports it for real (§6), but this app has no file-upload UI pattern
  anywhere yet (Document Management itself has no UI). Deferred the same way Phase 7a deferred
  `TaskAttachment`.
- Analytics (doc 20) and HR (doc 15) — the remaining two Phase 7 sub-modules.

### 10. Testing

Unit: `domain/comms-channel.spec.ts` (which channels are real). E2e (`apps/backend/test/`, real
Postgres/Redis, real console email adapter):

- `comms-thread-lifecycle.e2e-spec.ts` — create a thread, add participants, send a real IN_APP message and a
  real EMAIL message (asserts the real `EmailSenderPort.send()` contract was invoked with the right
  recipient/body), attempt a WHATSAPP send (asserts `ChannelNotAvailableError`, nothing persisted), record an
  ungated INBOUND message on a seam channel, close the thread.
- `comms-customer-activity-integration.e2e-spec.ts` — a CUSTOMER-type thread against a real seeded
  `Customer`, send a message, assert a real `CustomerActivity` row (`type: MESSAGE`) was created; a second
  case proves a non-CUSTOMER thread never touches `CustomerActivity`.
- `comms-task-creation.e2e-spec.ts` — the real cross-phase proof: publish via `createTaskFromThread()`,
  poll (same bounded-poll pattern Phase 7a's own event-consumption test uses) until a real `Task` row
  appears with `sourceModule: 'communication'`.

### 11. Verification

Full monorepo typecheck, `pnpm --filter backend build`, full e2e suite against real Postgres/Redis/MinIO —
confirmed the pre-existing baseline undisturbed (22/22 real suites, 92/93 tests, 1 pre-existing unrelated
skip) and the 4 new specs passing. Desktop UI (`ThreadListPage`/`ThreadDetailPage`/`ThreadCreatePage`,
`hooks/use-comms.ts`, wired into `apps/desktop`'s router/nav) browser-verified end to end via headless
Chrome against the real running backend + desktop dev server: thread creation, adding internal/external
participants, a real IN_APP send, a real WHATSAPP fail-fast (which is what surfaced §3's
`ChannelNotAvailableError` HTTP-mapping gap — fixed, then re-verified), task creation from a thread, and
closing a thread. The demo company's `Demo Admin` role needed its `RolePermission` rows extended for the
newly-seeded `communication:*` permissions (this platform has no company-admin auto-sync — see the RBAC
seed script note; every module's permissions are granted to existing roles as a one-time manual step,
not automatically).

## Analytics & Business Intelligence (doc 20) — Phase 7c

### 1. Scope: what doc 20 actually asked for vs. what shipped

Doc 20 is the widest-scoped doc in the whole roadmap — executive dashboards, per-domain analytics across
Sales/Trading/Finance/Inventory/Procurement/HR/AI, AI-generated insights, forecasting across five domains,
natural-language querying, and scheduled PDF/Excel/CSV report emailing, drawing on data from nearly every
other module. The user explicitly chose to scope this down to a **real, working core in one pass** rather
than splitting it further (confirmed via AskUserQuestion before implementation started), the same "ship a
coherent slice, not the full wishlist" discipline every phase before it has used.

**Shipped**: live-computed dashboards (Executive/Sales/Trading/Finance/Inventory/Procurement/AI) built from
real Prisma `groupBy`/`aggregate` queries (or a real fetch + in-memory reduce, the same technique
Accounting's own `aggregateTrialBalance` already uses, when Prisma can't express the computation in one
query) over existing tables — no data faked, no placeholder numbers. `AnalyticsSnapshot` persists periodic
KPI captures for trend history. One real `Forecast` type (Sales revenue — a deterministic linear-trend
projection over trailing months, computed in TypeScript, not guessed by an LLM). One real `AIInsight`
generator (an AI-written "business briefing" narrative over the current KPI snapshot, via a plain
`chatComplete()` call). A 4th AI agent, **Analytics Assistant**, giving natural-language query support
through the existing Agent SDK/orchestrator infrastructure with two new read-only tools. Real `Report`
generation (PDF via the reused `PdfKitDocumentGenerator`, CSV via a small hand-rolled serializer) stored
through Document Management, plus `ReportSchedule` with real recurring delivery (reusing
`WorkflowTriggerScheduler`'s `node-cron` pattern) and a real email notification linking to the stored
report.

**Deferred, not silently dropped**:

- **HR Analytics** and any **Knowledge-sourced** analytics — no data source exists (`modules/hr`,
  `modules/knowledge` are confirmed-empty skeletons, no `.ts` files at all). Doc 20's own Dashboard Types
  list doesn't even include a "Knowledge Analytics" section, only HR — a clean, doc-consistent deferral.
- **Cash Position** and **Business Health Score** (Executive Dashboard) — no bank/cash-balance model exists
  anywhere in Accounting yet, and "Business Health Score" has no defined weighting methodology from the
  business; inventing a formula would be faking a number, not computing one.
- **Balance Sheet, Aging Reports, Tax Summary** (Finance Analytics) — Accounting itself hasn't built these
  (only `trialBalance`/`profitAndLoss` exist); Analytics reuses what Accounting has, it doesn't build
  Accounting's missing reports for it.
- **Warehouse Utilization, Slow Moving Stock, Batch Expiry** (Inventory Analytics) — no capacity field on
  `Warehouse`, no movement-velocity computation, no batch/expiry field on `InventoryItem` today.
- **Supplier Performance, Delivery Performance** (Procurement Analytics) — `PurchaseOrder`/`GoodsReceipt`
  have no expected-vs-actual delivery date fields to score on-time-ness against.
- **Shipment Performance** (Trading Analytics) — no Shipment model exists yet.
- **Margin by Product** — deferred at the line-item level in one narrow case: `Quotation.marginPercent` is
  denormalized from the quotation's _current_ `QuotationVersion`, so margin-by-product walks
  `quotation.versions.find(v => v.versionNumber === quotation.currentVersionNumber)` for line items; margin
  by _customer_ needs no such join and is fully real.
- **Excel (XLSX) export** — no library anywhere in the repo; only PDF (`pdfkit`, already a real dependency
  of `packages/workflow`) and CSV ship this pass. Adding `exceljs` is a follow-up, not pre-emptive.
- **Configurable Dashboard/Widget layout** (drag-and-drop, user-arranged widgets) — no drag-and-drop
  precedent exists anywhere in `apps/desktop` (Phase 7a already deferred this for its own Kanban board, same
  reasoning applies here). Dashboards are fixed, real, computed sections — not a persisted `Dashboard`/
  `Widget`/`KPI` catalog; KPI values are computed live by service methods, not read from a configurable
  catalog table.
- **Email attachments** — `EmailSenderPort`'s `EmailMessage` has no attachment field anywhere in this
  codebase; extending that shared interface is out of scope for Analytics. Scheduled reports are delivered
  as a real stored `Document` (real R2/MinIO) plus an email that links to it via `DocumentService`'s real
  presigned-URL download, not a binary attachment.
- **Market Forecast, Commodity Price Prediction** — doc 20 itself labels these "Future," not asking for them
  now.
- **Demand/Inventory/Cash Flow/Procurement Forecasts** — one real forecast type (Sales) ships as the
  reference implementation of the pattern; the other four are the same shape, deferred to a later pass.

### 2. Naming: `modules/reports`, not `modules/analytics`

The workspace already had an empty `modules/reports` skeleton (`package.json` description: "Cross-module
reporting and analytics module") from the initial monorepo scaffold — this is the module's real home, not a
new `modules/analytics` folder; the package name stays `@modules/reports`. The **REST and desktop-UI
surface is `/analytics`**, not `/reports` — doc 20's own REST API section literally specifies `GET
/analytics/dashboard`, `GET /analytics/kpis`, etc., and `apps/desktop` already has a `/reports` route
serving Accounting's own `ReportsPage` (trial balance/P&L); reusing that path would collide. Desktop nav
label (once the UI pass lands): "Analytics".

### 3. Schema

New enums: `ForecastType` (`SALES` only this pass), `ReportType`
(`EXECUTIVE`/`SALES`/`TRADING`/`FINANCE`/`INVENTORY`/`PROCUREMENT`/`AI_USAGE`), `ReportFormat`
(`PDF`/`CSV`), `ReportScheduleFrequency` (`DAILY`/`WEEKLY`/`MONTHLY`), `AIInsightType`
(`BUSINESS_BRIEFING` only this pass).

Five real tenant-scoped aggregates (no pure-child tables this phase, unlike Tasks/Communication) — all
added to `TENANT_SCOPED_MODELS`: `AnalyticsSnapshot` (`metrics: Json` — a flexible bag, not one rigid
column per KPI, since the KPI set is expected to grow every future Analytics pass, same reasoning
`AgentExecution`'s own `Json` fields use), `Forecast` (`horizonMonths`/`basisPeriods`/`projectedValue`),
`AIInsight` (`title`/`body`), `Report` (`documentId?` — a **real** Prisma relation to the existing
`Document` model, `onDelete: SetNull`, same "intra-engine reference" reasoning `Task.projectId` already
established; `scheduleId?` likewise a real relation to `ReportSchedule`), `ReportSchedule`
(`recipientEmails: String[]`, `isActive`, `lastRunAt?`).

New `AuditEventType` members matching doc 20's list, minus the one that doesn't fit this app's existing
audit philosophy (every other phase's `AuditLog` records state changes, not reads — "Dashboard Viewed" is
deliberately skipped, same selective-mapping precedent Communication used): `REPORT_GENERATED`,
`REPORT_EXPORTED`, `FORECAST_GENERATED`, `AI_INSIGHT_GENERATED`, `SCHEDULED_REPORT_SENT`.

`packages/storage/src/domain/storage-key.ts`'s `STORAGE_MODULES` gains `'analytics'` — the same closed,
extensible list every module that reuses Document Management registers into.

### 4. Dashboards & KPIs — real Prisma aggregates, reusing existing services where they exist

`AnalyticsKpiService` (`modules/reports/application/analytics-kpi.service.ts`) exposes one method per
dashboard section. **Finance** surfaces Accounting's own `ReportsService.trialBalance`/`profitAndLoss`
as-is, through a narrow `FinanceReportsPort` — the same narrow-port-at-composition-root pattern
`modules/quotations` already established for `CustomerLookupPort`/`ProductLookupPort` (the port's return
types are declared locally in `modules/reports`, structurally matching Accounting's real shapes, never
imported from `modules/accounting` directly — "no module depends on another module's internals").
**Executive** combines Invoice-based revenue, Accounting's `netIncome`, and outstanding receivables.
**Sales** covers lead conversion (`Customer.status` groupBy), quote win rate, revenue by
customer/country/product (`Order`/`OrderLineItem`; country needs a second fetch since Prisma can't `groupBy`
across a relation in one query), and RFQ/Quotation pipeline counts. **Trading** covers RFQ/Quotation/Order
status counts and margin by product/customer (`Quotation.marginPercent`, a real existing field). **Inventory**
covers stock levels and inventory value (`quantityOnHand * Product.standardCost`, both real existing
fields). **Procurement** covers purchase spend by supplier and month-to-date spend. **AI** covers request
counts, cost (`AiUsageRecord`, extending `AiUsageRepository.sumCostSince`'s exact aggregate pattern),
automation rate (`ToolExecution.approvalRequestId IS NULL` / total), human override rate
(`ToolExecution.status === 'REJECTED'` / total-with-approval — `ToolExecutionStatus` already has a real
`REJECTED` value, no `ApprovalRequest` join needed), and prompt success rate (`AgentExecution.status ===
'COMPLETED'` / total).

`buildSnapshotMetrics()` assembles a headline subset of the above into the `Json` bag `captureSnapshot()`
writes to `AnalyticsSnapshot` — the basis both the Sales Forecast and any future trend chart read from, so
trend data is real historical capture, not recomputed-and-hoped-consistent on every read.

### 5. Forecast — real deterministic trend, not an AI guess

`domain/sales-forecast.ts`'s `projectNextPeriod()`: ordinary-least-squares linear regression over trailing
`TrendPoint`s (period index as x), clamped to zero (revenue can't legitimately project negative) — real
math, unit tested directly against a known series (perfect uptrend, flat trend, a downtrend clamped to
zero, and the `InsufficientForecastDataError` guard for fewer than 2 points). `AnalyticsForecastService`
feeds it real trailing-month `Order` revenue via `getMonthlyRevenueHistory()` (a raw `$queryRaw` with
`date_trunc('month', ...)`, manually scoped by `company_id` since raw SQL bypasses the tenant Prisma
extension entirely — same pattern `packages/search`'s `PgVectorSearchProvider` already established for its
own raw pgvector queries) and persists the result as a `Forecast` row. Keeping this deterministic (not
LLM-based) matches the platform's consistent "AI narrates, doesn't invent numbers" stance already
established (Phase 6 approvals stay human/rules-gated; Communication's channel gate is a real check, not an
AI judgment call).

### 6. AI Insight — one real "business briefing" generator

`AnalyticsInsightService.generateBusinessBriefing()`: gathers the current KPI snapshot + latest Sales
Forecast, builds a single `chatComplete()` call (no tools — `AiRouterService.chatComplete()`'s `tools`
param is optional, so a tools-less plain completion is directly supported) asking for a short narrative
summary, persists the result as an `AIInsight` row. The real substance behind doc 20's "AI Daily Briefing"
and "business summaries" bullets; other named insight types (customer/supplier risk, pricing
recommendations) are the same shape and explicitly deferred as a future `AIInsightType` addition — zero
architecture change needed, same "pluggable later" framing every Phase 6/7 agent-adjacent feature has used.

### 7. Analytics Assistant — the 4th AI agent, real natural-language querying

`packages/ai/src/agent-sdk/domain/agents/analytics-agent.definition.ts`, following `KNOWLEDGE_AGENT`'s
exact precedent: zero write-tools, `requiresHumanApproval: false` throughout. Two tools:
`analytics.queryKpis` (section + optional filters, returns real numbers from `AnalyticsKpiService`) and
`analytics.getForecast`. Added to the shared `AGENT_DEFINITIONS`/`TOOL_DEFINITIONS` arrays in
`packages/ai/src/agent-sdk/domain/agents/index.ts` alongside the original 3 — the doc comment there now
notes `ANALYTICS_AGENT` is the first of the "pluggable later" additions Phase 6 always intended. Bound in
`apps/backend/src/modules/ai/ai.module.ts`'s existing `buildToolExecutor()` hand-written map, calling the
new `AnalyticsKpiService`/`AnalyticsForecastService` directly (both injected into `AiModule` via a new
`imports: [..., AnalyticsModule]`) — never a direct cross-module service import outside the composition
root. The orchestrator's existing tool-calling loop (`AgentOrchestratorService`, unchanged) handles turning
"why did profit decrease?" into a `analytics.queryKpis` call plus a synthesized text answer — no bespoke
NL-to-SQL parser, reusing 100% of Phase 6's existing infrastructure. Doc 20's own `POST /analytics/query`
REST endpoint was deliberately **not** built as a separate route: every other agent (Sales/Inventory/
Knowledge) is invoked through the same generic `POST /ai/chat`/`POST /ai/execute` endpoints with a
different `agentKey`, and giving Analytics its own dedicated query route would also have created a circular
NestJS module dependency (`AiModule` needs `AnalyticsModule` for its tool bindings; a dedicated
`/analytics/query` route would need `AiModule`'s `AiFacadeService` back). Natural-language analytics
queries go through `POST /ai/chat` with `agentKey: 'analytics-agent'`, exactly like every other agent.

**A real gap found while writing the e2e test, not part of the original plan**: the new agent's system
prompt (`analytics-agent.system-prompt`, defined in `AGENT_SYSTEM_PROMPTS`) has no effect until it's
actually persisted as a platform-default `PromptTemplate` row — `PromptTemplateService.resolve()` reads
from the database, not from the code constant directly. `apps/backend/src/scripts/seed-ai-prompts.ts`
(idempotent, merges `DEFAULT_PROMPT_TEMPLATES` + `AGENT_SYSTEM_PROMPTS`) needs a re-run whenever a new
agent/prompt key is added — this was already true for the original 3 agents, just never exercised again
until this phase added a 4th. Documented here since it's easy to forget: the orchestrator throws a real
`PromptTemplateNotFoundError` at runtime, not a silent no-op, so this surfaces immediately in practice.

### 8. Report generation and scheduled delivery — reusing Phase 2/3/6 infra, not rebuilding it

`AnalyticsReportService.generateReport()` assembles the relevant KPI data into a `DocumentTemplate`
(`{title, textBlocks, table}` — `packages/workflow`'s existing shape) and calls the reused
`PdfKitDocumentGenerator` for PDF, or `domain/csv-serializer.ts` (real RFC-4180-style quote/comma/newline
escaping, unit tested directly) for CSV. The generated buffer is stored via `DocumentService.upload()`
(`module: 'analytics'`, `entityType: 'Report'`, `entityId: report.id`) — the exact generic-attachment
pattern already established; a `Report` row records the linkage (created first, then patched with the real
`documentId` once upload completes, since the upload itself needs the `Report`'s id as `entityId`).

`ReportSchedule` delivery reuses `WorkflowTriggerScheduler`'s real `node-cron` pattern directly —
`modules/reports/infrastructure/report-schedule.scheduler.ts`'s `registerReportScheduleRunner()` is a small
dedicated poller (5-minute interval, same cadence `apps/backend/src/scheduler/scheduler.ts`'s own workflow
polling uses), registered in `apps/backend/src/workers/worker.ts` alongside the existing subscribers — not
a new standalone process, and not modeled as Workflow nodes (that would entangle Reports with the Workflow
engine's own state machine for no real benefit). On each schedule's cron fire it calls `generateReport()`
then sends a real email via `EmailSenderPort` directly — **not** `NotificationService`, which requires a
real `recipientUserId` and is meant for in-app-notified users, not arbitrary schedule recipient addresses;
same lesson Phase 7b's Communication module already learned about `NotificationService` swallowing errors
and expecting the wrong kind of recipient identity. The email links to the report's real presigned download
URL from `DocumentService.download()`, never a binary attachment (§1's scope decision).
`runDueSchedules()` exposes a direct-invocation entrypoint for e2e tests, the same "invoke the handler
function directly" pattern `tasks-event-consumption.e2e-spec.ts` uses rather than waiting on a real cron
tick.

### 9. RBAC and REST surface

Single module string `'analytics'`; doc 20's Permissions list (View Analytics, Create Reports, Manage
Dashboards, Export Reports, Schedule Reports, View AI Insights) collapses onto the existing
`PermissionAction` enum with no new actions. Appended to `PHASE7_MODULES`
(`['tasks', 'communication', 'analytics']`) in `packages/permissions/src/rbac/seed-data.ts`.

```
GET  /analytics/dashboard/:section   [analytics:view]   — section = executive|sales|trading|finance|inventory|procurement|ai
GET  /analytics/kpis                 [analytics:view]   — flat KPI bag, same data buildSnapshotMetrics captures
GET  /analytics/forecast/:type       [analytics:view]
POST /analytics/forecast/:type       [analytics:create]  — trigger a fresh forecast generation
GET  /analytics/insights             [analytics:view]
POST /analytics/insights             [analytics:create]  — trigger a fresh AI briefing generation
GET  /analytics/reports              [analytics:view]
POST /analytics/reports              [analytics:create]  — generate a report now (type + format)
GET/POST /analytics/schedules        [analytics:view / analytics:manage_settings]
POST /analytics/schedules/:id/pause  [analytics:manage_settings]
POST /analytics/schedules/:id/resume [analytics:manage_settings]
```

Natural-language querying goes through the existing `POST /ai/chat` (see §7) — not a `/analytics/query`
route. `AnalyticsController`/`AnalyticsModule` follow the exact `useFactory` composition-root pattern
`comms.module.ts` established: `AnalyticsKpiService`/`AnalyticsForecastService`/`AnalyticsInsightService`/
`AnalyticsReportService` each constructed via `useFactory`, importing `AccountingModule` (for
`ReportsService`, wrapped in `FinanceReportsPort`) and `DocumentsModule` (for `DocumentService`, wrapped in
`ReportStoragePort`), with the same `ConsoleEmailSenderAdapter`/`SmtpEmailSenderAdapter` env-var-gated
construction block every other module's real email path uses.

### 10. Testing

Unit: `domain/sales-forecast.spec.ts` (linear-trend math over a known series, the zero-clamp, the
insufficient-data guard), `domain/csv-serializer.spec.ts` (comma/quote/newline escaping). E2e
(`apps/backend/test/`, real Postgres/Redis/MinIO, plus live Ollama for the two AI-dependent specs):

- `analytics-dashboard-kpis.e2e-spec.ts` — seeds real Customers/Products/Quotations/Orders/Invoices/
  Suppliers/PurchaseOrders/Warehouse/InventoryItem, asserts every dashboard section's real computed numbers
  against hand-computed expectations (8 assertions across Executive/Sales/Trading/Inventory/Procurement/
  Finance/AI/snapshot).
- `analytics-forecast-and-insight.e2e-spec.ts` — seeds three real trailing months of `Order` revenue on a
  clean linear trend (1000/2000/3000), asserts the real forecast projects the trend's exact continuation
  (4000); generates a real AI Business Briefing via live Ollama, asserts a persisted `AIInsight` with a
  non-empty body and a real new `AiUsageRecord`.
- `analytics-report-generation.e2e-spec.ts` — generates a real PDF and a real CSV report (full
  `DocumentService` composition, same wiring as `document-lifecycle.e2e-spec.ts`), asserts real `Document`/
  `DocumentVersion` rows with the right `entityType`/`entityId`/`contentType` and a non-trivial stored size.
- `analytics-scheduled-report-delivery.e2e-spec.ts` — creates a real `ReportSchedule`, fires
  `runDueSchedules()` directly, asserts a real `Report` + `Document` were created, `lastRunAt` was updated,
  and a real email send was attempted (spy-wrapped `ConsoleEmailSenderAdapter`, same pattern
  `comms-thread-lifecycle.e2e-spec.ts` uses) with the right recipient and a real download URL in the body.
- `analytics-nl-query-agent.e2e-spec.ts` — a live-Ollama tool-calling test for the Analytics Assistant,
  matching `ai-agents-tool-calling.e2e-spec.ts`'s exact shape: real orchestrator, real `analytics.queryKpis`
  tool execution, a real `ToolExecution` row asserting `status: 'SUCCEEDED'`.

### 11. Verification

Full monorepo typecheck and `pnpm --filter backend build` clean on the first pass. All 5 new e2e specs pass
(15/15 tests) against real Postgres/Redis/MinIO/Ollama. Full-suite regression run and desktop UI are the
next steps — see the top-level checkpoint before starting the UI pass, same sequence every prior phase used.
