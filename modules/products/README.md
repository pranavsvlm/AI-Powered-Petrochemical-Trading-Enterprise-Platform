# @modules/products

Petrochemical product catalog (doc 12): category hierarchy, dynamic attributes (EAV), packaging
options, and price lists (base / customer-specific / quantity-break / promotional). Pricing
resolution lives here (`ProductService.getEffectivePrice`) and is consumed by `@modules/quotations`
via an injected `PricingLookupPort` — never by another module querying this module's tables
directly.

Approval (Draft -> Active) is **delegated to `@platform/rules-engine`**
(`ApprovalEvaluator.evaluateApproval`), never reimplemented here. AI Product Expert and AI Pricing
are out of scope — see `docs/DOMAIN_MODEL_PHASE4.md`.

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
