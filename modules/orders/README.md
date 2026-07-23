# @modules/orders

Sales order management (doc 13): confirmation from a Quotation or created directly (repeat-order
fast path), status tracking, partial fulfillment/backorders via `OrderLineItem.fulfilledQuantity`,
and amendments recorded as an audit before/after diff rather than a bespoke amendment table.

Reads the source Quotation by calling `@modules/quotations`' published
`QuotationService.getForOrderCreation` through an injected `QuotationLookupPort` — never by
querying `quotations`' tables directly. Approval (doc 13 separately names "Approve Order" for the
direct-order path) is **delegated to `@platform/rules-engine`**
(`ApprovalEvaluator.evaluateApproval`), never reimplemented here. Inventory-driven automatic
backorder detection, shipment tracking, and export documentation are out of scope for Phase 4 —
see `docs/DOMAIN_MODEL_PHASE4.md`.

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
