# Phase 6 Domain Model — Ratified Decisions

AI Core & Agent Framework: `packages/ai` (docs 05/26) and the RAG substrate of Knowledge Management
(doc 18) — "the AI Gateway/Router/Orchestrator and multi-agent tool-calling, real implementations behind
every seam left open since Phase 2." This document is the source of truth for Phase 6 code, the same way
`DOMAIN_MODEL_PHASE1.md` through `DOMAIN_MODEL_PHASE5.md` are for their phases. Every prior phase left AI
functionality as an explicit seam (a port interface + a `NotImplementedInPhaseError`-throwing stub) so that
later code never had to change — only the stub gets swapped. Seven such seams existed going into this
phase; all seven are filled for real by the end of it.

## 1. `AiProviderConfig` is the real per-company router config; `CompanySettings.aiProvider` is finally wired up

`CompanySettings.aiProvider: String?` and `AuditEventType.AI_SETTINGS_CHANGED` existed unused since Phase 1.
Rather than invent a parallel concept, `AiProviderConfig` (companyId, provider, enabled, isDefault, priority,
baseUrl?, defaultChatModel?, defaultEmbedModel?, apiKeyRef?, monthlyCostCeilingUsd?,
`@@unique([companyId, provider])`) is the real per-provider row set a company configures, and
`CompanySettings.aiProvider` is read by `selectProviderOrder` as the preferred provider to try first (if
enabled), before falling back to `priority` order among the rest. `apiKeyRef` is a secret-manager/env key
**name**, never a raw key — resolved at call time via `ApiKeyResolver` (default: reads
`process.env[apiKeyRef]`). Append-only `AiUsageRecord` (companyId, provider, model, purpose, token counts,
costUsd, latencyMs, success, errorMessage?, requestedByUserId?, agentExecutionId?) is written by `AiRouter`
on every provider call regardless of caller, backing both cost-ceiling enforcement (`SUM(costUsd)` over the
current billing period) and every observability requirement with one mechanism, not two.

## 2. Fetch-based provider clients over official SDKs; Ollama + `qwen2.5:3b` is the one provider exercised live

All four `LlmProviderClient` implementations (OpenAI, Anthropic, Gemini, Ollama) are hand-written
fetch-based clients, not official SDKs — precedent: `RuleActionExecutor`'s `CALL_API` action already
injects `fetchImpl?: typeof fetch` for testability. This avoids three heavyweight SDK dependency trees and
makes contract-testing uniform: all four are JSON-over-HTTPS, each with a `*.contract.spec.ts` spinning up
an in-process `http.createServer()` test double asserting real request shape and response/error
classification (429→`RATE_LIMITED`, 5xx→`TRANSIENT`, 4xx→`FATAL`). Per the user's explicit scope decision
for this phase, only Ollama is ever called live in tests — OpenAI/Anthropic/Gemini get contract tests only,
never live paid calls in the suite.

**Model choice, empirically verified**: the plan originally proposed `llama3.2:1b` for the live e2e model.
Direct testing against the real Ollama API showed `llama3.2:1b` reliably mangles tool-call arguments for
anything beyond a single flat string field (e.g. it cannot reliably populate a nested `lineItems` array).
`qwen2.5:3b` (still small, still fast, `ollama pull qwen2.5:3b`) tool-calls reliably instead and is what
every live e2e spec actually uses (`ai-chat-completion`, `ai-agents-tool-calling`, `ai-approval-routing`,
`ai-cost-ceiling-throttling`). `nomic-embed-text` (768 dims) is the one embedding model, fixed for the phase
(see §7).

**Sampling temperature, empirically verified**: `AgentOrchestratorService`'s tool-calling loop calls
`AiRouter.chatComplete()` with `temperature: 0.2` (a named `AGENT_LOOP_TEMPERATURE` constant), not the
provider default. At default sampling, `qwen2.5:3b` intermittently answered in plain text instead of calling
a clearly-instructed, fully-specified tool (observed directly: `ai-agents-tool-calling.e2e-spec.ts` failed
non-deterministically — same input, same code, model chose not to call `quotations.createDirect` on one run
out of five). Lowering temperature to 0.2 favors deterministic instruction-following over response variety,
which is what tool selection needs; confirmed stable across 8 consecutive live runs after the change. This
is the only place in the codebase a temperature is set explicitly — `AiRouter.chatComplete`'s
`temperature`/`maxTokens` remain optional pass-throughs for every other caller.

## 3. Cost-ceiling hard-fails immediately; embedding is not per-company provider-switchable this phase

`AiRouter.chatComplete()` orders configured providers (§1), and for the head of the list estimates cost from
a static pricing table, sums current-period spend from `AiUsageRecord`, and evaluates the ceiling. **If the
ceiling would be exceeded, it throws `AiCostCeilingExceededError` immediately — it never falls back to a
spendier provider to route around a ceiling.** Only `TRANSIENT`/`RATE_LIMITED` provider failures advance to
the next configured provider; a `FATAL` failure rethrows immediately (no point retrying a malformed request
elsewhere); exhausting the list throws `AiAllProvidersExhaustedError`. `ai-cost-ceiling-throttling.e2e-spec.ts`
proves this against real Ollama calls with a test-injected synthetic non-zero price for `OLLAMA:qwen2.5:3b`
(Ollama itself is free — the default pricing table has no real entry for it, and using a synthetic override
via the constructor-injectable pricing table lets the ceiling logic be tested against real traffic without
needing a paid provider) and a tiny `monthlyCostCeilingUsd`: the call that would exceed the ceiling is
blocked _before dispatch_ — zero further Ollama HTTP calls. `embed()` mirrors the router shape but is **not**
provider-switchable per company — always the one platform-configured embedding provider/model — since
pgvector columns are fixed-width (§7); still logged through the same `AiUsageRecord` ledger.

## 4. Agent/Tool registry is code-defined and DB-mirrored, not user-authored

`Agent` (key, name, description, version, capabilities: `Json` string array of `Tool.key`,
systemPromptTemplateKey, isBuiltIn) and `Tool` (key, name, description, inputSchema, requiredPermissionModule,
requiredPermissionAction, requiresHumanApproval, isBuiltIn) are **not tenant-scoped** — a global catalog
defined in code (`packages/ai/src/agent-sdk/domain/agents/*.definition.ts`, `AGENT_DEFINITIONS`/
`TOOL_DEFINITIONS`) and mirrored into the database at boot by `AgentRegistryService.sync()`/
`ToolRegistryService.sync()` (idempotent upsert), unlike Rules/Workflows which are runtime-editable,
business-user-authored content. Two deliberate collapses from doc 26's literal entity list: no
`AgentCapability` table (collapsed into `Agent.capabilities: Json`); no `AgentAudit` table (reuses the
existing shared `AuditLog` plus new `AuditEventType` members —
`AI_AGENT_EXECUTION_STARTED`/`COMPLETED`/`FAILED`, `AI_TOOL_EXECUTED`, `AI_APPROVAL_REQUESTED` — the same
precedent every Phase 4/5 business module already set: only the generic engine phases, Rule/Workflow/
Document, got a dedicated audit table). Per-company agent enable/disable reuses the existing
`CompanyFeature` model (`moduleName: 'ai:<agentKey>'`) rather than a new join table.

## 5. Prompt Engine mirrors `Rule`/`RuleVersion` versioning; seeding lives in `apps/backend`, not `packages/database`

`PromptTemplate` (companyId? — null means platform-wide default, key, isActive,
`@@unique([companyId, key])`) and `PromptTemplateVersion` (pure child: promptTemplateId, version, content,
publishedAt?) mirror the existing `Rule`/`RuleVersion` two-table shape and the `Role.companyId: String?`
nullable-tenant pattern already established for platform defaults. `PromptTemplateService.resolve(companyId,
key, vars)` looks up the company's own row first, falls back via `withoutTenantScope()` to the
`companyId: null` platform default, then interpolates `{{var}}` placeholders with a pure resolver. A company
customizes a prompt by creating a same-`key` `PromptTemplate` row — zero code changes.

Platform-default rows are seeded by `apps/backend/src/scripts/seed-ai-prompts.ts`
(`pnpm --filter @platform/backend run seed:ai-prompts`), **not** by `packages/database/prisma/seed.ts` —
`packages/ai` already depends on `packages/database`, so `packages/database` depending back on
`packages/ai`'s `DEFAULT_PROMPT_TEMPLATES`/`AGENT_SYSTEM_PROMPTS` would be a real dependency cycle;
`apps/backend` already depends on everything, so it is the natural place to assemble AI-package-specific
bootstrap data. The script uses a raw, un-extended `PrismaClient` (never `getPrismaClient()`) because the
tenant extension would force `companyId` to whatever tenant context is bound, or throw if none is —
actively breaking a `companyId: null` platform-default write. It is idempotent: unchanged content is a
no-op; changed content publishes a new version.

## 6. Memory and Conversation are real tenant-scoped aggregates, never shared across companies

`Memory` (companyId, scopeType: `COMPANY|CUSTOMER|USER|CONVERSATION|TASK`, scopeId? — null for
company-scope facts, key, value: `Json`, sourceAgentKey?, confidence?, expiresAt?,
`@@unique([companyId, scopeType, scopeId, key])`) and `Conversation` (companyId, agentId?, subjectType:
`'user'|'customer'`, subjectId, title?, status) plus its pure child `ConversationMessage` are ordinary
tenant-scoped aggregates enforced by the same Prisma tenant extension as every business module — doc 05/26's
"never share memory between companies" is not a special case requiring new machinery, it falls out of the
platform's existing fail-closed tenant isolation. `MemoryService`/`ConversationService` are thin
application-layer wrappers with no cross-tenant read path.

## 7. Vector search seam filled — `PgVectorSearchProvider`, pgvector, fixed `vector(768)`

The first real `VectorSearchPort` implementation. `docker/docker-compose.yml`'s postgres image moved from
`postgres:16-alpine` to `pgvector/pgvector:pg16` (same Postgres 16 major version and data directory format,
so the existing `postgres_data` volume kept working unchanged). `schema.prisma` gained
`previewFeatures = ["postgresqlExtensions"]` and `extensions = [vector]`; `DocumentEmbedding.embedding` is
`Unsupported("vector(768)")` — the same `Unsupported(...)` pattern already used for `Document.searchVector`'s
tsvector column. The migration was hand-edited (same precedent as every prior phase's tsvector-drift fix) to
add `CREATE EXTENSION IF NOT EXISTS vector;` before the table changes and
`CREATE INDEX ... USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);` after — ivfflat over
hnsw, simpler at this data volume. `PgVectorSearchProvider` lives in `packages/search` (where
`VectorSearchPort` is defined), depends on `@platform/ai` for embeddings: `indexChunk()` chunks text
(~500 tokens, overlap), calls `AiRouter.embed()`, writes via raw `$executeRaw` (Prisma has no native vector
type); `similaritySearch()` embeds the query and uses `$queryRaw` with the `<=>` cosine-distance operator,
with `company_id` scoped **by hand** in the raw SQL — the tenant extension does not intercept raw SQL.
768 dimensions is fixed to match the one embedding model this phase exercises end-to-end
(`nomic-embed-text`); switching embedding models later needs a re-embedding migration, explicitly out of
scope (§14). `documents.module.ts` replaces `new NotImplementedVectorSearchProvider()` with the real
provider — the phase's core acceptance-criterion wiring.

## 8. Tool-binding constraint: agent tools may only bind to methods that own their complete transaction boundary

`InventoryService.reserve/release/commit/reverseCommit` take a `tx: TenantScopedTransactionClient` argument —
they are saga-internal primitives orchestrated by `OrderService.runConfirmationSaga` (Phase 5), not
standalone callable units; an agent tool calling one directly outside that saga would leave inventory in an
inconsistent state with no compensating action. The Inventory & Procurement Agent's tools are restricted to
methods that own their own complete transaction internally instead — `inventory.getInventoryItem`,
`inventory.adjustStock`, `procurement.createRequisition`, etc. — never the saga-internal primitives. This
constraint is why the tool list in §12 looks the way it does, and is the rule to apply when adding tool
bindings for any future agent against any future saga-shaped service.

## 9. The remaining six seams filled for real — first-ever wiring at every one except `AiDecisionProvider`

| Port                        | Real implementation                                                                                                                                  | Lives in                           | Wiring                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AiDecisionProvider`        | `RealAiDecisionProvider` — `AiRouter.chatComplete()` + a `'rules-engine.call-ai-action'` prompt template, parses `{decision, confidence, rationale}` | `packages/ai`                      | Replaces `new NotImplementedAiDecisionProvider()` at all 14 pre-existing call sites: `customers.module.ts`, `products.module.ts`, `quotations.module.ts`, `orders.module.ts`, `documents.module.ts`, `procurement.module.ts` (×2), `rules.controller.ts`, `workflows.controller.ts` (×2), `scheduler.ts` (×2), `worker.ts` (×2). |
| `OcrProvider`               | `RealOcrProvider` — routed through the same `AiRouter`/vision-capable model, **not** a separate Tesseract dependency                                 | `packages/ai`                      | First-ever wiring: `documents.module.ts`'s `DocumentService` factory. `DocumentService` gained a 7th constructor param (`ocrProvider`) and a new `extractText(documentId)` method — OCR was never wired at all before Phase 6.                                                                                                   |
| `AiNotificationAssistant`   | `AiRouter.chatComplete()` + prompt template                                                                                                          | `packages/ai`                      | First-ever wiring: `notifications.module.ts`.                                                                                                                                                                                                                                                                                    |
| `AiCustomerProfileProvider` | RAG over `CustomerActivity`/`Document` via semantic search + `AiRouter`                                                                              | `modules/customers/infrastructure` | First-ever wiring: `customers.module.ts`; `POST /customers/:id/ai-analysis` gated `customers:execute_ai` (permission code already auto-seeded).                                                                                                                                                                                  |
| `AiPricingProvider`         | Pulls `PriceList`/historical `QuotationLineItem` data + `AiRouter`                                                                                   | `modules/products/infrastructure`  | First-ever wiring: `products.module.ts`; `POST /products/:id/ai-pricing` gated `products:execute_ai`.                                                                                                                                                                                                                            |
| `AiProductExpertProvider`   | RAG over product spec `Document`s via `PgVectorSearchProvider` (§7)                                                                                  | `modules/products/infrastructure`  | First-ever wiring: `products.module.ts`; `POST /products/:id/ai-expert`; also the implementation behind the Sales Agent's `products.ragAsk` tool (§12) — one shared helper, not duplicated.                                                                                                                                      |

**Package/module boundary correction** (deviates from this phase's original plan text, documented as
intentional): the plan said the three Customer/Product AI providers "live in `packages/ai`" — but that
violates this codebase's real, consistently-enforced rule that `packages/*` must never depend on
`modules/*` (confirmed via `packages/search`'s own existing code comments, and zero exceptions exist
anywhere in the repo). Since those three seams need to read Customer/Product data, they live inside
`modules/customers/infrastructure/` and `modules/products/infrastructure/` instead, depending on
`@platform/ai` (the allowed direction). `RealAiDecisionProvider`, `RealAiNotificationAssistant`,
`RealOcrProvider` (no repo access needed — data passed as arguments) correctly stay in `packages/ai`.
`PgVectorSearchProvider` correctly lives in `packages/search`, where `VectorSearchPort` is defined.

`AiDecisionContext` (in `@platform/rules-engine`) gained a required `companyId` field so
`RealAiDecisionProvider` knows which company's `AiProviderConfig` to route through. The one pre-existing real
call site (`RuleActionExecutor`) was updated, and a second, plan-missed call site was found in
`packages/workflow/src/application/node-executor.ts`'s `AI_DECISION` node case — the type system caught it
as a real bug (would otherwise have silently sent `companyId: undefined`).

`ChatMessage` gained an optional `images?: Array<{mimeType, dataBase64}>` field (a flat sibling field, not a
full content-parts union) so the OCR seam routes through the same `AiRouter`/four clients as vision input;
each client maps it to its own real wire format (OpenAI `image_url`, Anthropic `image` blocks, Gemini
`inlineData`, Ollama's native `images` array), contract-tested per client.

## 10. Human Approval for AI actions reuses `ApprovalRequest`/`RuleEvaluationService` — no second approval system

`ApprovalRequest` (the mechanism Customer/Quotation/Order/Requisition/PurchaseOrder already use via their own
`requestApproval`/`decideApproval` pairs, with the decision delegated to
`RuleEvaluationService.evaluateApproval()`) is exactly what Phase 6's human-approval-for-AI-actions uses —
no parallel mechanism. In `AgentOrchestratorService.runLoop()`, when the model calls a tool and either
`Tool.requiresHumanApproval` is true or `RuleEvaluationService.evaluateApproval(companyId, 'ai', {...})`
returns approvers, the orchestrator creates a `ToolExecution` row (`AWAITING_APPROVAL`) plus a real
`ApprovalRequest` (entityType `'ToolExecution'`), persists everything needed to resume
(`AgentExecution.pausedState`: messages so far, the pending tool call, iteration count), sets the execution
`AWAITING_APPROVAL`, and **returns control without blocking** — nothing in Phases 1-5 pauses/resumes
mid-service-call across an HTTP request boundary; this pause/resume state machine is the one genuinely novel
piece of architecture this phase adds. `resumeAfterApproval(agentExecutionId, decision, actorUserId,
comment?)` calls the same `decideApproval` shape; on `APPROVED` it executes the previously-staged tool call
for real and re-enters the loop so the model can react to the result; on `REJECTED` it marks the
`ToolExecution` `REJECTED`, feeds back a synthetic rejection message, makes one final model call, and marks
the execution `CANCELLED`. `ai-approval-routing.e2e-spec.ts` proves this against the Inventory Agent's
approval-gated `inventory.adjustStock` tool with real Postgres and a real local Ollama call, live.

## 11. Tool-permission-scoping — an agent always runs as the calling user, never with elevated identity

Before executing any tool call, the orchestrator validates the tool is in the agent's `capabilities`,
validates the model's input against `Tool.inputSchema`, and runs a **permission check** via
`RbacPermissionChecker`, which calls the exact same `hasPermission`/`permissionCode` functions
`PermissionsGuard` already uses for every ordinary REST endpoint — against the _calling user's own_
permissions, not some elevated "agent" identity. If denied, a tool-error is fed back to the model rather than
crashing the execution. This is the concrete mechanism behind doc 26's "agent tool access scoped to the
calling user's own permissions" acceptance criterion.

## 12. The 3 representative agents

Per the user's explicit scope decision for this phase: build the generic orchestrator/tool-calling/memory/
policy framework once, prove it with 3 representative agents (not all 11-15 named in doc 26). Every other
doc-26-named agent (Trading, Finance, HR, Reporting, Compliance, Executive Assistant, AI Receptionist, Export
Agent, Workflow Agent) is **not built** — pluggable into the same `AgentDefinition`/`ToolDefinition` shape
later with zero architecture changes.

- **Sales & Quotation Agent** (`sales-agent`, consolidates doc 26's Sales + Quotation + Product-Expert
  agents): `customers.getById`/`customers.checkCredit` (view), `products.getEffectivePrice` (view),
  `products.ragAsk` (execute_ai, §9), `quotations.createFromRfq`/`.createDirect` (create),
  `quotations.requestApproval` (approve — itself internally gated via the Rules Engine, a separate
  complementary layer from this agent-level check), `quotations.send` (edit, **`requiresHumanApproval:
true`** — doc 26's "sensitive AI response" example).
- **Inventory & Procurement Agent** (`inventory-agent`, consolidates Inventory + Procurement, respecting
  the §8 transaction-boundary constraint): `inventory.getInventoryItem` (view), `inventory.adjustStock`
  (edit, **requires approval**), `procurement.getSupplier` (view), `procurement.createRequisition` (create),
  `procurement.submitRequisition` (edit — relies on the existing Rules Engine gate already built into Phase
  5), `procurement.createPurchaseOrderFromRequisition` (create, **requires approval** — high-value spend
  commitment).
- **Knowledge Assistant** (`knowledge-agent`): deliberately read-only, zero write-tools, zero approval path
  — proves the RAG substrate (§7) through the full agent framework, not just a raw `SearchService` unit
  test. Tools: `knowledge.search` (semantic mode, view), `knowledge.getDocument` (view).

`ai-agents-tool-calling.e2e-spec.ts` runs the real composed `AgentOrchestratorService` (real services, not
mocks — the same pattern `order-invoice-inventory-saga.e2e-spec.ts` already established) against a seeded
Customer/Product, asserting a real `Quotation` row is created via the tool call plus a real
`AgentExecution`/`ToolExecution` trail.

## 13. RBAC

New module string `'ai'`, matching the `/ai/*` REST prefix; `PHASE6_MODULES = ['ai']` in
`packages/permissions/src/rbac/seed-data.ts`. Doc 26's bespoke permission names map onto the existing closed
`PermissionAction` enum — no new actions:

| Doc 26 permission                                                       | `module:action`                                                                                                                    |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Use AI                                                                  | `ai:execute_ai`                                                                                                                    |
| Manage Agents / Manage Prompts / Manage Memory / Configure AI Providers | `ai:manage_settings` (same administrative bucket `products:manage_settings` already uses for "Manage Pricing"/"Manage Categories") |
| Approve AI Actions                                                      | `ai:approve`                                                                                                                       |
| View AI Analytics                                                       | `ai:view`                                                                                                                          |

No new roles: existing `COMPANY_ADMIN`/`SALES_MANAGER`/`INVENTORY_MANAGER`/`PROCUREMENT_MANAGER` cover this
once granted the new `ai:*` codes.

REST surface (`apps/backend/src/modules/ai/ai.controller.ts`), deliberately thin — the real domain logic
lives in `packages/ai`, mirroring how `packages/rules-engine`/`packages/workflow` hold the real logic while
`apps/backend/src/modules/{rules,workflows}` are thin controller shells:

```
GET    /ai/agents                    [ai:view]
GET    /ai/agents/:key               [ai:view]
POST   /ai/chat                      [ai:execute_ai]
POST   /ai/execute                   [ai:execute_ai]
GET    /ai/executions                [ai:view]
GET    /ai/executions/:id            [ai:view]
POST   /ai/executions/:id/approve    [ai:approve]
POST   /ai/executions/:id/reject     [ai:approve]
GET    /ai/memory                    [ai:manage_settings]
GET    /ai/providers                 [ai:manage_settings]
POST   /ai/providers                 [ai:manage_settings]
```

Plus four narrower endpoints added directly on their owning modules ahead of/alongside the `/ai/*` surface,
each gated by the pre-existing auto-seeded `execute_ai` permission code for that module (no RBAC seed change
needed for these four): `POST /customers/:id/ai-analysis`, `POST /products/:id/ai-pricing`,
`POST /products/:id/ai-expert`, `POST /documents/:id/ocr`.

`AiModule`'s `useFactory` wiring follows the exact pattern `orders.module.ts` established: it constructs
`AiRouter`/`AgentOrchestratorService`, injecting closures over sibling modules' concrete services
(`CustomerService`, `ProductService`, `QuotationService`, `InventoryService`, `RequisitionService`,
`PurchaseOrderService`, `SupplierService`, `DocumentService`) as the tool-binding ports — the Agent SDK never
imports another module's Repository directly, exactly like `OrderService`'s `QuotationLookupPort`.

## 14. Explicitly out of scope for Phase 6 (carried into Phase 7+)

- Every doc-26-named agent beyond the 3 built (§12): Trading, Finance, HR, Reporting, Compliance, Executive
  Assistant, AI Receptionist, Export Agent, Workflow Agent.
- `modules/knowledge`'s own dedicated API/UI (categories, collections, browsing UI) — only the RAG substrate
  (§7) was built this phase.
- Azure OpenAI (addable later as a 5th `AiProviderKind`).
- Voice/Vision AI beyond OCR-via-vision-routing (§9).
- Autonomous, unbounded-duration agents — the tool-calling loop is iteration-bounded (default 8 iterations
  per `AgentOrchestratorService`); doc 26's "long-running autonomous tasks" is deferred.
- Multi-agent collaboration (agents calling other agents).
- Predictive analytics / demand forecasting.
- An admin UI for provider/prompt/memory configuration — this phase is REST-only; a UI is a separate future
  step, same checkpoint discipline as every prior phase (backend first, UI as its own follow-up).
- Re-embedding migration tooling (needed only if the fixed embedding model/dimension in §7 ever changes).

## Verification

Full monorepo typecheck (`pnpm --filter '!@platform/portal' -r typecheck`) and `pnpm --filter backend build`
are clean. Unit/contract specs: 78 passed in `packages/ai`, 13 in `packages/search`, 11 in
`modules/customers`, 14 in `modules/products` — all green. Full e2e suite against real Postgres (with
pgvector) + Redis + MinIO + a real local Ollama daemon (`qwen2.5:3b` + `nomic-embed-text`): 71 passed, 1
pre-existing skip, 0 failures, including all 5 new Phase 6 specs (`ai-chat-completion`,
`ai-semantic-search`, `ai-agents-tool-calling`, `ai-approval-routing`, `ai-cost-ceiling-throttling`) — the
actual bar for "real" per this phase's own philosophy, not just typecheck.
