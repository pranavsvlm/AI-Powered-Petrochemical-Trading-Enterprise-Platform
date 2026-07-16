# Phase 2 Domain Model — Ratified Decisions

Platform Backbone: Event Bus (doc 28), Business Rules Engine (doc 23), Workflow Engine (doc 22),
Notification Center (doc 24). This document is the source of truth for Phase 2 code, the same way
`DOMAIN_MODEL_PHASE1.md` is for Phase 1.

## 1. AI seam (Call AI action / AI Decision node / AI Rule Assistant / AI Notification Assistant)

No LLM integration exists in Phase 2. Every place the specs call for AI behavior is implemented as a
typed, documented, **intentionally throwing** seam:

- `packages/rules-engine` defines `AiDecisionProvider` (`packages/rules-engine/src/domain/ports/ai-decision-provider.port.ts`)
  with a single method `decide(context): Promise<AiDecisionResult>`. The shipped implementation,
  `NotImplementedAiDecisionProvider`, throws `NotImplementedInPhaseError('AI Rule Assistant / Call AI action', 'Phase 3+')`.
  The `CALL_AI` rule action handler calls this port; it never contains inline "TODO: call OpenAI" style code.
- `packages/workflow` reuses the same `AiDecisionProvider` port for the `AI_DECISION` node type via
  dependency injection — the workflow engine is provider-agnostic and does not duplicate the seam.
- `packages/notifications` defines `AiNotificationAssistant` port (summarization/prioritization) with the
  same `NotImplementedInPhaseError` behavior, invoked only if a caller explicitly opts into
  AI-assisted digesting (nothing in Phase 2 does, by design).
- `NotImplementedInPhaseError` lives in `packages/core/src/errors/not-implemented-in-phase.error.ts` so
  all three packages throw the identical typed error shape (`{ feature, availableFrom }`), which the
  global exception filter maps to HTTP 501.

This is the one deliberate placeholder pattern in Phase 2; it is a typed seam, not a silent stub, and
every AI-shaped API request fails fast and explains itself rather than doing nothing quietly.

## 2. Notification channels: Email + In-App real, WhatsApp/SMS/Push seamed

`NotificationChannel` enum has 5 values: `EMAIL`, `IN_APP`, `WHATSAPP`, `SMS`, `PUSH`. Only `EMAIL` and
`IN_APP` have real adapters (`EmailChannelAdapter`, `InAppChannelAdapter`) registered in the
`ChannelAdapterRegistry`. Selecting `WHATSAPP`/`SMS`/`PUSH` on a notification/template/preference throws
`ChannelNotAvailableError` ("channel not yet available in this phase") at send time — the enum values and
schema columns exist so future phases add an adapter without a migration, but no queueing/silent-drop
happens for unimplemented channels.

`EmailSenderPort` (previously defined ad hoc in `packages/auth` for MFA email-OTP in Phase 1) is promoted
to live in `packages/notifications/src/domain/ports/email-sender.port.ts` as the single long-term owner.
`packages/auth` now depends on `packages/notifications` for its email port instead of defining its own,
removing the Phase-1-era duplication noted in `DOMAIN_MODEL_PHASE1.md` §5. Two adapters ship: an SMTP
adapter (`nodemailer`) and a console/log adapter used in dev/test (`NOTIFICATIONS_EMAIL_ADAPTER=console`).

## 3. Approval-rule ownership: Rules Engine is canonical; Phase-1 tables become one read source

Phase 1 shipped `ApprovalRule`/`Policy`/`ApprovalHistory` as data-only tables in Roles & Permissions
(see Phase 1 doc §4, explicitly flagged as "no rule execution/evaluation engine — that is Phase 2").
Decision: **the Business Rules Engine (`packages/rules-engine`) becomes the single canonical evaluation
point for approval-type decisions going forward.** Concretely:

- `packages/rules-engine` adds an `ApprovalRuleSource` port with two implementations: `LegacyApprovalRuleSource`
  (reads the existing Phase-1 `ApprovalRule` table read-only, adapting its `triggerCondition`/`threshold`
  JSON into the Rules Engine's condition format) and `NativeRuleSource` (rules created directly as
  `Rule`/`RuleVersion` records with `action.type = REQUEST_APPROVAL`). `RuleEvaluationService.evaluate()`
  merges candidates from both sources, so existing Phase-1 approval rules keep working unmodified.
- New approval rules should be authored natively in the Rules Engine going forward (documented in
  `packages/rules-engine/README.md`); the legacy table is not deprecated/dropped in Phase 2 (no
  destructive migration) but is frozen to read-only from the engine's perspective — Roles & Permissions'
  existing CRUD on `ApprovalRule` is untouched and still writes to the same table.
- `packages/workflow`'s `APPROVAL` node type does **not** reimplement approval resolution: it calls
  `RulesEngineClient.evaluateApproval(workflowExecutionId, context)` (rules-engine's public API), which
  internally consults both sources and returns the resolved approver chain (single/multi-level/parallel).
  This satisfies "does NOT reimplement approval logic" from the workflow spec.
- Net effect: there is one coherent approval system after Phase 2, not two disconnected ones — Phase 1's
  tables are a _data source_, Phase 2's engine is the _evaluator_.

## 4. Rule conflict-resolution algorithm (deterministic, no AI)

On evaluation, applicable rules (company-scoped + effective-date-scoped + status = PUBLISHED) for a given
`module`/trigger are sorted by `priority DESC, updatedAt DESC, id ASC` (fully deterministic tie-break).
Actions are executed by priority order; a `BLOCK` action short-circuits and stops further action execution
for that evaluation (block wins over allow/warn regardless of order, since it is safety-critical), unless
a strictly higher-priority rule already returned `ALLOW` with `terminal: true`. This is implemented in
`RuleConflictResolver.resolve()` and unit-tested with fixtures covering: same-priority tie, contradictory
actions (one ALLOW one BLOCK) at equal priority (BLOCK wins — documented "safety wins ties"), and strictly
prioritized override.

Conflict _detection_ (surfaced at publish time and via `POST /rules/simulate`) flags two published rules in
the same company+module whose conditions overlap (computed via condition-tree intersection: same field
comparisons with overlapping value ranges/equality) and whose actions are contradictory
(`ALLOW` vs `BLOCK`/`WARN` on the same trigger). This is a structural/static check, not AI-based.

## 5. "Generate Task" rule action — no Task module yet

`packages/rules-engine`'s `GENERATE_TASK` action handler does not write to any Task table (none exists).
It publishes a `TaskGenerationRequested` event via the Event Bus (typed payload: `{ ruleId, executionId,
companyId, assigneeUserId?, assigneeTeamId?, title, description, dueDate?, sourceModule, sourceEntityId? }`).
A future Task module is expected to subscribe to this topic. This is documented so nobody mistakes the
rules-engine's `RuleExecution.actionsPerformed` log entry for the task actually existing anywhere yet.

## 6. Workflow's own lightweight Task node vs. future Task module

Workflow's `TASK` node type is explicitly workflow-local bookkeeping (`WorkflowTask` table, assigned to a
`User`/`Team`, has `status`/`dueDate`/`completedAt`), independent of the rules-engine's
`TaskGenerationRequested` event above. It does not depend on a future Task module and is not the same
concept — a `WorkflowTask` only ever gates progression of its own `WorkflowExecution`.

## 7. Workflow `DOCUMENT` node — real PDF, swappable port

No Document Management module exists yet. `packages/workflow` ships a real, working
`DocumentGeneratorPort` (`generate(template, data): Promise<{ buffer: Buffer; filename: string }>`) with
one concrete adapter, `PdfKitDocumentGenerator`, using `pdfkit` to render a template (static text blocks +
`{{variable}}` substitution + a simple table block) into an actual valid PDF written to
`packages/storage`'s existing storage port (local disk in dev). No headless-browser dependency was
introduced. This is swappable later behind the same port when a real Document Management module lands.

## 8. Workflow `DATABASE` node — whitelisted models only

The `DATABASE` node type only allows create/update against a fixed whitelist of Prisma models introduced
in Phase 1 or Phase 2 (`Department`, `Team`, `CompanyFeature`, `Notification`, `WorkflowTask` — extendable
by editing `DATABASE_NODE_MODEL_WHITELIST` in `packages/workflow/src/infrastructure/database-node-whitelist.ts`).
Any other model name is rejected at publish time (not just at execution time), since business-module
tables (Trading, Finance, Inventory, etc.) don't exist yet and won't until later phases.

## 9. Delay node — BullMQ, not setTimeout

The `DELAY` node type schedules resumption via a BullMQ delayed job (`workflow-resume` queue) keyed off
`resume_at`; a `WorkflowResumeProcessor` picks the job up and resumes execution from the persisted
`WorkflowExecution.currentNodeId`. If Redis/BullMQ is unavailable the node fails loudly (no fallback
timer), since a silent in-memory `setTimeout` would not survive a process restart and would violate the
spec's "do not fake it" instruction.

## 10. Explicitly out of scope for Phase 2 (carried into Phase 3+)

- Real LLM calls for AI Decision / AI Rule Assistant / AI Notification Assistant (seam only, §1).
- WhatsApp/SMS/Push notification delivery (seam only, §2).
- Any Task module, Document Management module, or business-module (Trading/Finance/Inventory/etc.) tables.
- OAuth2/SAML/SSO (carried over from Phase 1, still Future).
- Multi-region event bus / cross-cluster replication — single Redis instance per environment for Phase 2.
