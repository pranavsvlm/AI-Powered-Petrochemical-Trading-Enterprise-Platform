# @modules/quotations

RFQ intake and Quotation creation/versioning/approval (doc 13). Owns both `Rfq` and `Quotation`
because they share a tight 1:1 lifecycle and approval machinery — `modules/trading` (deals,
positions, contracts) is a separate, later-phase concern and does not own RFQ; see
`docs/DOMAIN_MODEL_PHASE4.md`.

Pricing is resolved by calling `@modules/products`' published `ProductService.getEffectivePrice`
through an injected `PricingLookupPort` — never by querying `products`' tables directly. Approval
(the one explicit gate in doc 13, between Negotiation and Sales Order) is **delegated to
`@platform/rules-engine`** (`ApprovalEvaluator.evaluateApproval`), never reimplemented here.
Quotation PDF generation, email/WhatsApp sharing, and AI recommendations are out of scope for
Phase 4 — see `docs/DOMAIN_MODEL_PHASE4.md`.

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
