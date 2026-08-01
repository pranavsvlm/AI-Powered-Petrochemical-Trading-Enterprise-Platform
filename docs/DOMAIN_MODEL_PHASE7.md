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
