# Phase 8 Domain Model — Ratified Decisions

Phase 8 on the standing roadmap covers three spec docs — API & Integration Platform (doc 27),
Plugin SDK (doc 29), Developer Platform (doc 30) — bundled under the title "Extensibility
Platform." All three are terse wishlists (entity names and endpoint lists only, no field-level
schema), consistent with every prior phase's docs. The user chose this phase over the
alternative next-candidate (Phase 14, multi-company access) via explicit confirmation. Given the
phase's size (comparable to all of Phase 7's four sub-modules combined), it shipped in three
checkpointed batches — Batch A (API Foundations), Batch B (Webhooks + Plugin Lifecycle), Batch C
(Developer endpoints) — each independently planned, backend-built, e2e-verified, UI-built (where
applicable), browser-verified, and checked in with the user before the next batch started.

## 1. Scope: what docs 27/29/30 actually asked for vs. what shipped

Research (3 Explore agents plus a Plan-validation agent, before any code was written) confirmed
this was fully greenfield: no Swagger, no rate-limiting, no API-key auth, no plugin system
existed anywhere in the repo. But strong existing infrastructure was available to build on
rather than reinvent — the real `RedisStreamsEventBus`, the `CompanyFeature` per-tenant-toggle
precedent, the `AiProviderConfig` settings-page precedent, and the existing
`JwtAuthGuard`/`PermissionsGuard`/`TenantContextMiddleware` stack.

**Shipped**: real URI-based API versioning (`/v1`) with a real, reusable (if not yet applied)
deprecation-header mechanism; real inbound API-key authentication, alongside JWT, that
authenticates as the owning user and inherits their real RBAC; a real global rate limiter and a
real opt-in idempotency-key replay mechanism; live OpenAPI/Swagger documentation; a real per-tenant
plugin install/activate/deactivate/uninstall lifecycle gating a first-party capability (not
sandboxed third-party code); real outbound webhooks, gated by that plugin lifecycle and
dispatched through the existing event bus with real HMAC signing; two real, low-risk Developer
Platform endpoints (health, version).

**Deferred, not silently dropped**:

- **Sandboxed third-party plugin execution** — signed packages, a marketplace, dependency
  resolution, the full `Develop → Validate → Package → Install → Activate → Execute → Upgrade →
Disable → Uninstall` lifecycle doc 29 describes for externally-authored code. No plugin authors
  exist, no marketplace has content, and a secure sandbox is a distinct, large, security-critical
  undertaking — this pass ships the real _lifecycle_ (install/activate/deactivate/uninstall),
  gating a first-party, in-process capability instead.
- **`Integration`/`IntegrationLog`** (doc 27) — skipped entirely. Every concrete integration
  category the doc lists (ERP, Shipping, Customs, Payment Gateways) is explicitly "Future"-tagged
  by the doc itself, and integrations that already exist (AI providers, Email, WhatsApp) already
  have their own real per-module config tables. A generic wrapper model would have had no real
  behavior behind it.
- **SAML/OIDC, GraphQL, a public SDK (TS/Python/C#/Java), a plugin marketplace** — all explicitly
  "Future"-tagged in doc 27/29's own text, not silently dropped.
- **`DeveloperProfile`/`Environment`/`BuildArtifact`/`Release`/`Deployment`/`PipelineRun`,
  `POST /developer/generate`, `GET /developer/releases`** (doc 30) — real CI exists in this repo
  (`.github/workflows/ci.yml`: lint/typecheck/test) but there is no CD stage, so there is nothing
  real to attach deployment/release/pipeline-run tracking to. Building the tracking tables
  without the actual pipeline would be furniture, not function.
- **Retrofitting Swagger `@ApiProperty` decorators onto the 25 pre-existing controllers' DTOs** —
  only Phase 8's own new DTOs are decorated this pass; retrofitting everything else is a real,
  separate follow-up, not done here.
- **A dedicated retry scheduler for FAILED webhook deliveries** — `WebhookDelivery.attempt`
  exists as a real extension point, but the scheduled-retry job itself (the same `node-cron`
  shape `WorkflowTriggerScheduler`/`ReportSchedule` already use) is deferred.

## 2. Entity collapsing

Matches every prior phase's approach to wishlist entities: `ApiClient` folds into `ApiKey` — a
key authenticates AS an existing platform user and inherits that user's real RBAC permissions, no
separate scopes system invented. `ApiAudit` and `PluginAudit` both collapse into the existing
shared `AuditLog` table (this platform has always used one audit log, never a table per module).
The plugin catalog itself (`PLUGIN_DEFINITIONS`) is a static in-code array mirroring the AI Agent
Framework's `AGENT_DEFINITIONS` registry, not a DB table — `PluginVersion`/`PluginDependency`/
`PluginPermission` are skipped since no real third-party plugin content exists yet to version,
depend on, or request permissions for. The only real per-tenant DB state is `PluginInstall`.

## 3. Schema

New models (all real tenant-scoped aggregates, added to `TENANT_SCOPED_MODELS`): `ApiKey`
(`companyId`, `userId`, `name`, `keyPrefix`, `keyHash` unique, `lastUsedAt?`, `revokedAt?` —
soft-delete convention, never a real row delete), `Webhook` (`companyId`, `url`, `eventTypes:
String[]`, `secret`, `enabled`), `WebhookDelivery` (`companyId`, `webhookId`, `eventType`,
`attempt`, `status: WebhookDeliveryStatus`, `responseStatusCode?`, `lastAttemptAt?`),
`PluginInstall` (`companyId`, `pluginKey`, `enabled`, `installedAt`, `uninstalledAt?` —
soft-delete). New enum: `WebhookDeliveryStatus` (`PENDING`/`SUCCEEDED`/`FAILED`).

New `AuditEventType` members: `API_KEY_CREATED`, `API_KEY_REVOKED` (Batch A);
`WEBHOOK_CREATED`, `WEBHOOK_DELIVERED`, `WEBHOOK_DELIVERY_FAILED`, `PLUGIN_INSTALLED`,
`PLUGIN_ACTIVATED`, `PLUGIN_DEACTIVATED`, `PLUGIN_UNINSTALLED` (Batch B).

New module: `modules/extensibility` — a fresh skeleton (no pre-existing empty scaffold was
reserved for this phase; `modules/knowledge`/`trading`/`whatsapp` are reserved for other future
phases), housing `ApiKeyService`/`PluginService`/`WebhookService`, their repositories, domain
logic, and desktop UI. Rate-limiting/idempotency/versioning guards and interceptors live directly
in `apps/backend/src/common/` (cross-cutting backend-process infra, matching where
`JwtAuthGuard`/`PermissionsGuard`/`TenantContextMiddleware` already live) — not inside the domain
module.

## 4. API versioning, Swagger, and the shared bootstrap helper

NestJS's built-in `VersioningType.URI`, default version `'1'` — every route gained `/v1` for free
with zero per-controller changes (nothing had an explicit version set before). The pre-existing
root health check (`GET /`) was marked `@Version(VERSION_NEUTRAL)` so it keeps responding
unversioned, since it predates this phase and existing monitoring may hit it directly. The desktop
app's `BASE_URL` constant moved from `/api` to `/api/v1` in the same change — both landed together
to avoid a broken window between backend and desktop.

A real, reusable `@Deprecated(sunset?)` decorator + `DeprecationInterceptor` adds RFC-8594-style
`Deprecation`/`Sunset` response headers — but since this is the platform's first API version,
nothing is actually marked deprecated yet; the mechanism is real and ships ready, with nothing
genuinely legacy to sunset on a fresh v1.

`@nestjs/swagger` is live at `/api/docs` (JSON at `/api/docs-json`), with Bearer and `X-Api-Key`
auth schemes both registered. `apps/backend/src/bootstrap/configure-app.ts` is a new shared
helper holding the handful of things Nest genuinely cannot express as DI-registered providers —
API versioning and the Swagger document have no `APP_*` token equivalent — called by both
`main.ts` and every new HTTP e2e spec, so they can't silently drift apart. Everything else
(`ValidationPipe`, `GlobalExceptionFilter`, `DeprecationInterceptor`, `IdempotencyInterceptor`,
`RateLimitGuard`) is registered as an `APP_PIPE`/`APP_FILTER`/`APP_INTERCEPTOR`/`APP_GUARD`
provider in `app.module.ts` instead, so `TestingModule`-built e2e apps pick those up
automatically via DI with zero risk of drift — a stronger guarantee than the imperative-only
approach originally planned.

**A real, previously-latent bug found while writing the first HTTP e2e test**: `import * as
request from 'supertest'` silently fails to be callable under this repo's `esModuleInterop`
TypeScript config (`__importStar`'s namespace-wrapper strips callability from a CJS
function-export). This exact pattern already existed in the codebase's only prior supertest usage
(`apps/backend/test/app.e2e-spec.ts`) — never caught because that file's one test is `it.skip`'d.
Fixed by using `import request from 'supertest'` (default import) in the new specs.

## 5. API Keys — a key authenticates as its owning user

`ApiKeyService.create()` generates a real opaque secret (`nvk_` + `generateOpaqueToken(32)` from
`@platform/auth`), stores only its sha256 hash, and returns the raw secret exactly once — the
same "shown once, never re-displayed" UX every PAT-style system (GitHub, Stripe) uses. No
separate scopes system: the key authenticates as the creating user via `X-Api-Key`, inheriting
that user's real, live-queried RBAC roles — matching this platform's consistent "ordinary access,
not a special bypass" stance (the same principle noted for the still-pending Phase 14 design).
`DELETE /api-keys/:id` soft-revokes (`revokedAt`), never a real row delete.

**The one real architectural gap this phase's research surfaced, fixed before it could bite**:
`TenantContextMiddleware` runs _before_ all guards and is what actually binds
`TenantContextStore` (AsyncLocalStorage) for the request — a guard cannot fix this after the
fact, since `TenantContextStore.run()`'s binding doesn't survive past the callback that invoked
it. As originally scoped ("add an `ApiKeyGuard`"), every API-key-authenticated request to any
tenant-scoped model would have 500'd with "no tenant context bound" — not an edge case, every
real request. Fixed by extending `TenantContextMiddleware` itself to resolve `X-Api-Key` (hash
lookup via `withoutTenantScope`) when no `Authorization: Bearer` is present, mirroring the
existing precedent that the middleware and `JwtAuthGuard` already both independently verify the
same Bearer token today. Rather than a separate `ApiKeyGuard`, `JwtAuthGuard` itself branches
internally on which header is present and populates `req.user` in the identical
`JwtAccessTokenPayload` shape either way — zero diffs to any of the 25 pre-existing controllers.

## 6. Rate limiting and idempotency

`RateLimitGuard` is a global `APP_GUARD`, a Redis fixed-window counter (`INCR`+`EXPIRE`, reusing
`getSharedRedisConnection()` from `@platform/event-bus` — not a second Redis client), keyed by
**client IP** rather than company/user: global guards run before controller-level guards in
Nest's pipeline, so `req.user` isn't populated yet when this runs — IP-keying is also the
standard "protect the whole gateway, including pre-auth routes like login" pattern. Threshold is
env-configurable (`RATE_LIMIT_PER_MINUTE`), generous by default.

`IdempotencyInterceptor` is opt-in via an `Idempotency-Key` request header — entirely
non-breaking, a client that never sends it sees zero behavior change. A real atomic Redis claim
(`SET key PROCESSING EX ttl NX`) — not the non-atomic GET-then-SET idiom
`redis-streams.adapter.ts`'s consumer-dedup uses (that one is safe only because XREADGROUP
consumer-group semantics already guarantee single-consumer processing; raw concurrent HTTP
requests need a true atomic claim). A concurrent in-flight request with the same key gets a real
`409`; a repeat call after the first completed gets the identical cached response replayed, never
reprocessed.

## 7. Plugin lifecycle — real, scoped to first-party capabilities

`PluginService` implements the real install → activate → deactivate → uninstall lifecycle doc 29
asks for, against the static `PLUGIN_DEFINITIONS` catalog (one real entry this pass: `'webhooks'`).
Doc 29's sandboxed-third-party-code model (signed packages, a marketplace, dependency resolution)
is explicitly deferred as its own future security-critical initiative — every catalog entry here
is a first-party, in-process, platform-authored capability being gated behind a real lifecycle,
not arbitrary uploaded code. `PluginInstall` uses the soft-delete convention
(`uninstalledAt`) every other module in this codebase uses.

## 8. Webhooks — gated by the plugin lifecycle, dispatched via the real event bus

Rather than fabricate a demo plugin, the Webhooks feature (doc 27) is gated behind the Plugin
lifecycle itself (doc 29) — a company must install **and** activate the `'webhooks'` plugin
before `WebhookService.create()` will accept a subscription; deactivating or uninstalling blocks
new webhook creation **and** pauses dispatch of existing ones, checked at both creation time and
again inside the real dispatch subscriber. This ties both docs into one coherent story instead of
two disconnected halves, and proves the lifecycle against a real effect rather than a no-op
toggle.

Dispatch reuses the existing `RedisStreamsEventBus.subscribe()` (real retry/backoff/dead-letter
already built in — no separate retry logic invented), wired as a new subscriber
(`registerWebhookDispatchSubscriber`) in `apps/backend/src/workers/worker.ts`, following
`registerTaskGenerationRequestedSubscriber`'s exact shape, for `EVENT_TYPES.ORDER_CREATED`
(confirmed real: `modules/orders/application/order.service.ts` already publishes this with
`{orderId, quotationId?, totalAmount}`). HMAC-SHA256 signing via Node's built-in `crypto`
(`X-NavOasis-Signature: sha256=<hex>`, the same scheme Stripe/GitHub webhooks use — no new
dependency). `POST /webhooks/test` sends a synthetic payload immediately, not through the event
bus, reusing the same `WebhookDispatcher` (deliberately zero DB access, so it's identical code on
both paths).

**A deliberate design refinement over the original plan**: a single subscribed webhook's HTTP
delivery failure is _not_ thrown back to the event bus. Throwing would make the event bus
redeliver the whole event to _every_ subscribed webhook again, including ones that already
succeeded — a real duplicate-delivery bug the original "just let the event bus retry" framing
would have caused. Each webhook's delivery outcome is recorded independently as a
`WebhookDelivery` row (`SUCCEEDED`/`FAILED`); only genuine event-_processing_ failures (e.g. a DB
error) still throw and get the event bus's real retry/dead-letter treatment.

Proven end-to-end in a dedicated e2e spec: a real `http.createServer()` "external" receiver on an
ephemeral port, a real `ORDER_CREATED` event published through the real event bus, a real
correctly-HMAC-signed POST received and independently re-verified by the test, and a real
`WebhookDelivery` row with `status: SUCCEEDED`.

## 9. Developer Platform — scoped down to two real endpoints

`GET /developer/health` (`@Public()`, no guard at all) performs a real `SELECT 1` against
Postgres and a real Redis `PING`, returning `200 {status: 'ok', ...}` or a real `503` if either is
unreachable. `GET /developer/version` (behind `JwtAuthGuard` only — no `@RequirePermission`, no
`'developer'` RBAC module, since there's nothing to gate) returns a real git SHA
(`git rev-parse HEAD`, computed once at module load) and the real `package.json` version. Every
other doc-30 entity/endpoint is deferred (§1) — no desktop UI page exists for this doc, since
these two endpoints are ops/infra-facing (health checks, curl), not an in-app admin screen.

## 10. RBAC and REST surface

Doc-bespoke permission names collapse onto the existing `PermissionAction` enum, per the
established convention (documented in `seed-data.ts`) — e.g. "Manage API Keys" →
`api-keys:manage_settings` is available but this pass's controller uses the simpler
`create`/`view`/`delete` triad; "Install Plugins" → `plugins:create`; "Manage Webhooks" →
`webhooks:create`/`view`. `PHASE8_MODULES` grew across the batches: `['api-keys']` → `['api-keys',
'webhooks', 'plugins']`. No `'developer'` module — neither Developer endpoint is
permission-gated.

```
POST/GET   /v1/api-keys                    [api-keys:create / api-keys:view]
DELETE     /v1/api-keys/:id                [api-keys:delete]              — soft-revoke

POST/GET   /v1/webhooks                    [webhooks:create / webhooks:view]
GET        /v1/webhooks/:id/deliveries     [webhooks:view]
POST       /v1/webhooks/test               [webhooks:create]              — on-demand ping

GET        /v1/plugins                     [plugins:view]
POST       /v1/plugins/:key/install        [plugins:create]
POST       /v1/plugins/:key/activate       [plugins:edit]
POST       /v1/plugins/:key/deactivate     [plugins:edit]
DELETE     /v1/plugins/:key                [plugins:delete]               — soft-uninstall

GET        /v1/developer/health            [public]
GET        /v1/developer/version           [authenticated, no permission check]

GET        /api/docs, /api/docs-json       — live Swagger UI / OpenAPI document
```

`ExtensibilityModule` follows the exact `useFactory` composition-root pattern every prior
module's `*.module.ts` uses. `WebhookService` is constructed with `PluginService` injected
directly (intra-module composition, not a cross-module narrow port, since both live in
`modules/extensibility`).

## 11. Desktop UI

Three new pages, following the established low-ceremony card/table style — no new UI patterns
except where the underlying capability genuinely needed one: `ApiKeysPage` (list +
create-with-one-time-reveal + revoke — a new pattern versus the `AiProviderConfig`-style editable
form, since a key's secret can't be re-edited or re-shown once created), `WebhooksPage` (create
form + list + per-row "send test"/"show deliveries" expand, with a direct link to the Plugins
page when creation is blocked), `PluginsPage` (catalog list with contextual
install/activate/deactivate/uninstall buttons per row, closely mirroring a
company-features-style toggle table). No Developer UI page (§9).

## 12. Testing

Unit: `domain/webhook-signing.spec.ts` (3 tests — HMAC determinism, secret-sensitivity,
body-sensitivity). 3/3 passing.

E2e (`apps/backend/test/`, real Postgres/Redis, real HTTP via `supertest`), 14/14 passing:

- `api-platform-foundations.e2e-spec.ts` (4 tests) — the versioned root health check; real API-key
  creation over JWT auth, then a real request authenticated with only `X-Api-Key` (no
  `Authorization` header at all), then real revocation and rejection; a real idempotency replay
  (two identical POSTs, one real row created); a real `429` after a synthetic burst (rate limit
  temporarily lowered for this file only, since the limiter's Redis-backed counter is external,
  shared state — not per-test).
- `plugin-lifecycle.e2e-spec.ts` (6 tests) — the real catalog listing; webhook creation genuinely
  blocked pre-install and pre-activation; install; activate unblocking real webhook creation;
  deactivate re-blocking it; uninstall reverting to the not-installed state — with real audit
  entries at every transition.
- `webhook-delivery.e2e-spec.ts` (2 tests) — a real local HTTP receiver gets a real,
  independently-re-verified HMAC-signed POST from a real `ORDER_CREATED` event through the real
  event bus; a real `WebhookDelivery` row records `SUCCEEDED` with the real response status code.
- `developer-endpoints.e2e-spec.ts` (2 tests) — the real health check's real DB/Redis
  connectivity; the real version endpoint's auth requirement and real payload shape.

This is also the first genuinely HTTP-layer e2e testing in this codebase's history — every one of
the 31 pre-existing e2e specs calls application services directly; the one prior HTTP-oriented
spec (`app.e2e-spec.ts`) has always had its single test skipped. The `esModuleInterop`/supertest
bug (§4) and the `TenantContextMiddleware` gap (§5) were both only discoverable by actually
exercising the real HTTP pipeline, not by unit-testing guards/services in isolation — the same
"run the real composed thing, not a mock" discipline every phase before this one has used, this
time surfacing infrastructure gaps that isolated testing structurally could not have caught.

## 13. Verification

Full monorepo typecheck and `pnpm --filter backend build`/`pnpm --filter desktop build` clean
after every batch. Full e2e regression run after each batch and once more after all three
batches landed. Every new e2e spec, plus the pre-existing suite, passing with zero real
regressions — the one intermittent failure seen mid-phase (`ai-agents-tool-calling.e2e-spec.ts`)
is the same already-documented ~1/5 Ollama flakiness from Phase 6/7, unrelated to this phase's
changes (confirmed by isolated re-run passing cleanly, and by the test itself calling the
orchestrator directly rather than through any HTTP path this phase touched). Browser-verified via
Playwright for all three UI-bearing pieces: API Keys (create/reveal-once/list/revoke), and the
Webhooks/Plugins pair together (blocked-then-unblocked webhook creation, a real test delivery
against a placeholder URL honestly reporting a real HTTP failure rather than faking success,
plugin deactivation correctly reverting UI state).
