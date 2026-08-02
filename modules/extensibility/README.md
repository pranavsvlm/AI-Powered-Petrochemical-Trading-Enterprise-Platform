# @modules/extensibility

Extensibility Platform module (docs 27/29) — API keys, webhooks, and the plugin
install/enable/disable lifecycle. See docs/DOMAIN_MODEL_PHASE8.md for scope decisions.

## Structure

Follows the platform module contract (see docs/03_Monorepo_Architecture.md):

- `api/` — module-facing API surface (controllers/routes)
- `application/` — use cases / application services
- `domain/` — domain entities and business rules
- `infrastructure/` — persistence and external integrations
- `ui/` — module UI components
- `hooks/` — frontend hooks

No module may directly depend on another module's internals.

> Status: Batch A (API Keys) implemented. Webhooks/Plugin lifecycle (Batch B) and Developer
> endpoints (Batch C) pending.
