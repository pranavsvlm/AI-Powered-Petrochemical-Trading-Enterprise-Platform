# Phase 4 Domain Model — Ratified Decisions

Core Trading Domain: `modules/customers` (doc 11), `modules/products` (doc 12), and `modules/quotations` +
`modules/orders` (doc 13's RFQ → Quotation → Sales Order lifecycle). This document is the source of truth
for Phase 4 code, the same way `DOMAIN_MODEL_PHASE1.md` through `DOMAIN_MODEL_PHASE3.md` are for their
phases. Docs 11/12/13 are, like docs 21/22/23 before them, terse: they name entities and draw lifecycle
arrows but specify no concrete states, transitions, or field lists — inventing and ratifying those is the
core work of this document.

## 1. RFQ ownership: `modules/quotations`, not `modules/trading`

Doc 13 files RFQ Management under "Trading Engine," which reads as though it belongs in
`modules/trading`. **Decision: RFQ lives in `modules/quotations`.** RFQ → Quotation is a tight 1:1 lifecycle
pair — `Quotation.rfqId` FK, a shared line-item/pricing shape, and (per §9 below) the one approval gate doc
13 names sits on the Quotation, not the RFQ. `modules/trading`'s own package description ("deals, positions,
contracts") is a distinctly later-phase concern (§2). Keeping RFQ next to Quotation avoids a needless
cross-module call for what is functionally one workflow.

## 2. `modules/trading` deferred entirely to Phase 5

Doc 13's remaining unique content beyond RFQ/Quotation/Order — Contracts, Shipments/`ShipmentContainer`,
`TradeDocument` generation, a live `CurrencyRate` feed, Incoterm as tenant-configurable master data, and the
"AI Trading Assistant" — is all post-Order-confirmation logistics/fulfillment. None of it is required by the
Phase 4 acceptance criteria (RFQ → Quotation → Order, with Event Bus + Rules Engine wiring). The
`modules/trading` skeleton is left untouched and is **not** seeded into `PHASE4_MODULES` — there are no
controllers to gate. Phase 5 (Inventory, Procurement & Finance) is the natural place to pick this up, since
Contracts/Shipments are fulfillment-side concerns that phase already owns.

## 3. Pricing lives in `modules/products`

Doc 12 already frames `PriceList` (customer-specific/region/currency/contract/quantity-break pricing) as PIM
content, and doc 12's own permission list names "Manage Pricing" as a Products permission. No bespoke
pricing-engine module skeleton exists. `ProductService.getEffectivePrice(companyId, productId, {customerId?,
quantity, currency, asOf?})` is the one published pricing seam; `modules/quotations` calls it through an
injected `PricingLookupPort`, never by querying `products`' tables directly (§11).

## 4. No new "PriceRule" table — reuses the existing Rule pipeline

Doc 13 names `PriceRule` as a database entity for margin-threshold/discount-limit checks ("Detect unusual
discounts," "Margin thresholds"). **Decision: no second rule table.** These checks are ordinary uses of the
existing `Rule`/`RuleGroup` schema (module `'products'` or `'quotations'`) evaluated through
`RuleEvaluationService.evaluate()`'s existing ALLOW/BLOCK/WARN pipeline. Building a parallel rule table would
violate the "Rules Engine is canonical" law from `DOMAIN_MODEL_PHASE2.md` §3 and the "no second approval
system" law from `DOMAIN_MODEL_PHASE3.md` §6. Phase 4 does not wire an automatic margin-threshold check into
`QuotationService` itself — the mechanism (the general `evaluate()` pipeline, and `AttributeContext`'s
pre-existing `orderValue`/`customerType`/`productCategory` fields) is in place, but authoring an actual
margin-threshold rule is left to company admins via the existing Rules Engine CRUD, not hardcoded here.

## 5. Incoterm and UnitOfMeasure are Prisma enums, not master-data tables

Both are small, fixed, non-tenant-extensible vocabularies (Incoterm: `FOB, CIF, CFR, EXW, FCA, DDP, DAP` per
doc 13; UnitOfMeasure: `MT, KG, LITER, GALLON, BARREL, CUBIC_METER, PIECE`, invented — doc 12 never names a
UoM field despite pricing/packaging implying one). This mirrors `DocumentStatus`'s treatment, not
`Document.module`'s (that field is deliberately a validated `String` because `packages/storage` — a
different package — owns that vocabulary; no other package owns Incoterm/UoM, so a real enum is the more
recent, preferred pattern from Phase 3, per `Document`'s own FK/enum choices).

## 6. Product hierarchy collapsed to two self-referential tables

Doc 12's 7-level tree (Business Unit → Category → Sub Category → Product Family → Product → Variant →
Packaging) becomes two tables: `Category` (self-referential `parentId`, covering BU/Category/SubCategory/
ProductFamily as one recursive tree) and `Product.parentProductId` (self-FK; a Variant _is_ a Product row
pointing at its parent). `Brand`/`Manufacturer` are plain string columns on `Product`, not their own tables —
doc 12's own API sketch (`GET/POST /categories`, `GET/POST /attributes`) never asks for `/brands` or
`/manufacturers` CRUD.

## 7. Dynamic product attributes — EAV

Doc 12 requires "companies may create unlimited attributes without code changes" (Density, Viscosity, Flash
Point, Pour Point, Sulfur, Color, API Gravity, Ash Content, ...). `ProductAttribute` (name + `dataType`) +
`ProductAttributeValue` (`value: String` + a `valueNumber: Decimal?` shadow column) implement this as EAV.
The shadow column exists so numeric attributes can be range-queried (`@@index([attributeId, valueNumber])`)
without parsing the canonical string value at read time. `castAttributeValue` (pure domain function) enforces
the declared `dataType` (STRING/NUMBER/BOOLEAN/DATE) at write time.

## 8. Packaging — enum + join table

`PackagingType` (`DRUM, IBC, FLEXIBAG, ISO_TANK, TANK_TRUCK, BULK_VESSEL, BAG, PAIL, CUSTOM`, per doc 12) is a
fixed enum, but a plain enum array on `Product` isn't enough — each packaging option needs its own
`unitsPerPackage`/`uom`, so `ProductPackaging` is a real join table (`@@unique([productId, packagingType])`).

## 9. The three state machines and the one approval gate

Doc 13's lifecycle sketch — "Customer Enquiry → AI Qualification → RFQ → AI Product Matching → AI Pricing
Engine → Quotation → Negotiation → Approval (if required) → Sales Order → Export Documentation → Shipment →
Commercial Invoice → Payment Tracking → After-Sales Support" — names no states, actors, or guards. Ratified:

- **`RfqStatus`**: `DRAFT → SUBMITTED → QUOTED → CLOSED`, `CANCELLED` from `DRAFT`/`SUBMITTED`.
  `RfqService.submit()` is what fires `EVENT_TYPES.RFQ_RECEIVED` — doc 13 draws no distinction between an
  internally-drafted RFQ and one externally received, so one event covers both once the RFQ is formally
  logged.
- **`QuotationStatus`**: `DRAFT → SENT ⇄ NEGOTIATING → PENDING_APPROVAL → APPROVED → CONVERTED`, plus
  `CANCELLED` from most non-terminal states. This is the **one explicit approval gate** doc 13 names
  ("Approval (if required)," between Negotiation and Sales Order):
  `QuotationService.requestApproval()` transitions `SENT`/`NEGOTIATING → PENDING_APPROVAL` and delegates
  100% to `RuleEvaluationService.evaluateApproval('quotations', {orderValue, currency, marginPercent, ...})`
  — zero approvers matched ⇒ auto-approve, identical to `DocumentService.requestApproval`'s auto-publish
  path (`DOMAIN_MODEL_PHASE3.md` §6). There is **no `REJECTED` status on `Quotation` itself** — see §10.
- **`OrderStatus`**: `PENDING_CONFIRMATION → CONFIRMED → (PARTIALLY_FULFILLED ⇄ FULFILLED) → CLOSED`, plus
  `ON_HOLD` (manual only — no Inventory module exists yet to drive automatic backorder detection, deferred
  to Phase 5) and `CANCELLED`. `computeAggregateFulfillmentStatus` (pure domain function) derives
  `PARTIALLY_FULFILLED`/`FULFILLED` from `OrderLineItem.fulfilledQuantity` vs `quantity`. "Amendments" (doc 13) are recorded as an `AuditEventType.ORDER_UPDATED` before/after diff on `OrderService.amend()`, not a
  new `OrderAmendment` table — mirrors `DocumentService.updateMetadata`'s audit-diff pattern. Order also
  gets its own `requestApproval`/`decideApproval` (doc 13 separately names "Approve Order" for the
  direct-order-without-quotation fast path).

## 10. No second approval system — rejection reopens straight to NEGOTIATING

Early drafting of this phase included a `QuotationStatus.REJECTED` value. **Reversed**: `ApprovalRequest`
already carries `ApprovalStatus.REJECTED`; a parallel `REJECTED` value on `Quotation.status` itself would be
a second place tracking the same fact, exactly what `DOMAIN_MODEL_PHASE3.md` §6 forbids (and unreachable in
practice — `QuotationService.decideApproval` would set it and immediately transition away from it in the
same call). `QuotationStatus` therefore has no `REJECTED` value; `decideApproval('REJECTED', ...)` moves the
quotation straight to `NEGOTIATING` so sales can revise and resubmit, mirroring
`DocumentService.decideApproval`'s reopen-to-`DRAFT` behavior exactly. `AuditEventType.QUOTATION_REJECTED`
and `EVENT_TYPES.QUOTATION_APPROVED`/`QUOTATION_REJECTED` still exist as historical-fact records (same as
`DOCUMENT_REJECTED` existing despite no `DocumentStatus.REJECTED`).

`ApprovalRequest` itself is **one polymorphic model** (`entityType`/`entityId` + `ruleExecutionId` link back
to `RuleExecution`), shared by Customer/Quotation/Order — structurally identical to `DocumentApproval`,
never a bespoke decision-maker of its own.

## 11. Cross-module composition rule (resolves "no direct cross-module DB access")

A module's application service may hold a **Prisma FK relation** to another module's model — the schema is
shared platform infrastructure, the same precedent `Document.ownerUserId → User` already set in Phase 3.
What it must **never** do is import or call another module's `Repository` class, or hand-roll a query
against a table it doesn't own. Concretely:

- `QuotationService` never touches `products`' tables for pricing. It depends on an injected narrow
  `PricingLookupPort { getEffectivePrice(companyId, productId, query) }`, satisfied at NestJS `useFactory`
  time by a closure calling `ProductService.getEffectivePrice` — a call into `ProductService`'s **published**
  method, not a raw query. (`apps/backend/src/modules/quotations/quotations.module.ts` imports
  `ProductsModule` for exactly this.)
- `OrderService` never touches `quotations`' tables directly. It depends on an injected `QuotationLookupPort
{ getForOrderCreation(quotationId), markConverted(quotationId, actorUserId) }`, satisfied by closures
  calling `QuotationService.getForOrderCreation`/`.convertToOrder` (`apps/backend/src/modules/orders/
orders.module.ts` imports `QuotationsModule`). `markConverted` is what actually flips the source
  Quotation to `CONVERTED` once its Order exists — without it, doc 13's "Sales Order" step would never mark
  the quotation side of the transition, leaving `QuotationStatus.APPROVED` permanently.

**A live-infra e2e test caught a real cross-tenant gap this pattern must also close**: a bare Prisma FK
(`Rfq.customerId`, `Order.customerId`, any `productId`) only guarantees the referenced row exists _somewhere_
— Postgres FK constraints don't check that it belongs to the caller's tenant, and the tenant-isolation
extension (`packages/database/src/tenant-extension.ts`) only rewrites the `companyId` column on the
operation being run, not arbitrary FK-valued columns pointing at _other_ tenant-scoped tables. Concretely,
before this fix, Company B could successfully create an RFQ whose `customerId`/line-item `productId`
pointed at Company A's rows — a real defense-in-depth hole, not a hypothetical. **Fix**: every service that
accepts a foreign customerId/productId from a caller (`RfqService.create`/`.addLineItem`,
`QuotationService.createDirect`, `OrderService.createDirect`) now routes it through the owning module's own
tenant-scoped `getById` — via the same narrow-port pattern (`CustomerLookupPort { getById }`,
`ProductLookupPort { getById }`, satisfied by `CustomerService.getById`/`ProductService.getById`, both of
which the tenant extension already forces `companyId` into) — before ever writing the reference. This is the
generalizable rule for Phase 5+: **any FK a service accepts from caller input, pointing at a different
tenant-scoped aggregate, must be validated through that aggregate's own tenant-scoped lookup before being
persisted — never trust the raw id.** `createFromRfq`/`createFromQuotation` are exempt from a _repeated_
check because the id they use was already validated once, upstream, when the RFQ/Quotation itself was
created or looked up under the same tenant context.

This generalizes the `ApprovalEvaluator`/`XxxEventPublisher` dependency-inversion convention from Phase 3
(cross-_layer_) to cross-_module_. Read-only cross-module aggregation (e.g. "list this customer's orders")
is explicitly **deferred** for Phase 4 — see §14 — rather than wired ad hoc into `CustomersController`.

## 12. Customer fields invented beyond doc 11

Doc 11 lists `Customer` fields (`customer_code, legal_name, trade_name, tax_number, country, city, address,
currency, language, industry, website, status`) but names no credit/segmentation fields despite its own
"financial visibility" objective. Added: `creditLimit: Decimal?`, `paymentTermsDays: Int?` (directly required
by that objective); `customerType` enum (`DISTRIBUTOR, END_USER, TRADER, MANUFACTURER, OTHER`) — this exact
field is already anticipated by `AttributeContext.customerType` in `packages/types`, intended for rule/policy
targeting; `segment: String?` (freeform — doc 11 gives no fixed vocabulary, so not an enum); `tags:
String[]` (a native Postgres array, not a `CustomerTag`/`CustomerTagAssignment` join pair — doc 11 doesn't
ask for a centrally-managed, renamable tag taxonomy the way doc 21 did for Documents, so the join-table
ceremony isn't earned here).

`CustomerStatus` includes `PENDING_APPROVAL` because doc 11 explicitly names an "Approve Customer"
permission; `Customer` gets the same `requestApproval`/`decideApproval` pair as Quotation/Order at near-zero
marginal cost (§9's approval-gate pattern is already fully general).

## 13. Customer Timeline is not a table

`GET /customers/:id/timeline` (doc 11's API sketch) is **not backed by a new table**. It reads `AuditLog`
filtered by `entityType='Customer', entityId` through a narrow `CustomerAuditReader` interface —
`CustomerService` defines the interface, and the NestJS wiring supplies a closure over
`prisma.auditLog.findMany`. This is the read-side twin of the existing audit-writer pattern
(`CustomerAuditWriter`), and avoids a duplicate event log parallel to what `AuditLog` already records. Doc
11's separately-named `CustomerActivity`/`CustomerNote` concept (manual notes, calls, meetings) **is** a real
table (`CustomerActivity`) — it's genuinely different from an audit trail (it's user-authored content, not a
system-generated record of what changed).

## 14. Documents, media, certificates — reuse `Document.entityType` polymorphism

Doc 11's "Customer Documents," doc 12's "Product Documents"/"Certificates," and doc 13's export-document set
(Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin, COA, SDS/MSDS, TDS, Insurance
Certificate, Customs Documents) all reuse Phase 3's existing `Document.entityType`/`entityId` polymorphic
attachment (`entityType: 'customer' | 'product' | 'quotation' | 'order'`) — zero new tables, per the Phase 3
precedent. Phase 4 does not add dedicated "upload customer document" REST endpoints; the existing
`DocumentsController` already accepts an arbitrary `entityType`/`entityId` pair. Quotation PDF generation
(doc 13: "PDF generation, digital approval, email/WhatsApp sharing") is **out of scope** for Phase 4 — see
§16.

## 15. AI seams

Customer Profile analysis (doc 11), Product Expert (doc 12), and Pricing recommendations (doc 12/13) all
follow the existing `NotImplementedInPhaseError`-typed port pattern established in
`DOMAIN_MODEL_PHASE3.md` §3 (`packages/storage`'s `OcrProvider`/`NotImplementedOcrProvider` is the template):
`AiCustomerProfileProvider`, `AiProductExpertProvider`, `AiPricingProvider` each ship only a
`NotImplementedXxxProvider` that throws `NotImplementedInPhaseError('<Feature>', 'Phase 6+')`. Their
corresponding permissions (`customers:execute_ai`, `products:execute_ai`) are seeded now so RBAC is ready,
even though no controller route calls the seam yet — consistent with how Document Management shipped
`documents:execute_ai`-equivalent seams without a route in Phase 3. "AI Trading Assistant" (doc 13) is
deferred along with `modules/trading` itself (§2).

## 16. Permission mapping table

Doc 11/12/13's bespoke-sounding permission names map onto the existing, closed `PermissionAction` enum
(`VIEW, CREATE, EDIT, DELETE, APPROVE, REJECT, EXPORT, IMPORT, PRINT, SHARE, EXECUTE_AI, MANAGE_SETTINGS`) —
no new action names were added, matching the precedent `documents.controller.ts` set in Phase 3.

| Doc permission (prose)                          | `module:action`                                                |
| ----------------------------------------------- | -------------------------------------------------------------- |
| View/Create/Edit/Delete/Export/Approve Customer | `customers:view\|create\|edit\|delete\|export\|approve`        |
| AI Customer Analysis                            | `customers:execute_ai`                                         |
| View/Create/Edit/Delete/Approve/Export Products | `products:view\|create\|edit\|delete\|approve\|export`         |
| Manage Categories                               | `products:manage_settings`                                     |
| Manage Pricing                                  | `products:manage_settings`                                     |
| Use AI Product Expert                           | `products:execute_ai`                                          |
| View RFQ / Create RFQ                           | `quotations:view` / `quotations:create`                        |
| Approve Quotation                               | `quotations:approve`                                           |
| Approve Order                                   | `orders:approve`                                               |
| Export Documents                                | `documents:export` (existing Phase 3 permission, reused as-is) |
| Manage Contracts, Use AI Trading Assistant      | deferred to Phase 5 with `modules/trading` (§2) — not seeded   |

`PHASE4_MODULES = ['customers', 'products', 'quotations', 'orders']` in
`packages/permissions/src/rbac/seed-data.ts`, spliced into `SEED_PERMISSIONS` alongside
`PHASE1_MODULES`/`PHASE2_MODULES`/`PHASE3_MODULES`. `'trading'` is deliberately absent.

## 17. Numbers (RFQ/Quotation/Order) are caller-supplied, not auto-generated

`rfqNumber`/`quotationNumber`/`orderNumber` are plain unique-per-company strings supplied by the caller (DTO
validation only enforces non-empty), the same treatment `Customer.customerCode` and `Product.sku` already
got in this same phase. A real sequential numbering scheme (e.g. `RFQ-2026-00001`) is a UX nicety, not a
correctness requirement of the acceptance criteria, and is deferred rather than built speculatively.

## 18. Explicitly out of scope for Phase 4 (carried into later phases)

- `modules/trading` in full: Contracts, Shipments/`ShipmentContainer`, `TradeDocument` generation workflow,
  live `CurrencyRate` feed, Incoterm as tenant-configurable master data, "AI Trading Assistant" (§2).
- Quotation PDF generation, digital signature/approval, and email/WhatsApp sharing (§14) — would reuse
  `packages/workflow`'s `DocumentGeneratorPort`/`PdfKitDocumentGenerator` when picked up.
- Automatic backorder detection driven by real inventory levels (`ON_HOLD` is manual-only in Phase 4; real
  inventory reservation is Phase 5's "Inventory, Procurement & Finance").
- RFQ import from email or WhatsApp (doc 13 explicitly marks both "future").
- A live `CurrencyRate` feed / multi-currency conversion at quotation time — `currency` is stored per
  RFQ/Quotation/Order as a snapshot ISO code; no FX conversion is performed.
- Read-only cross-module aggregation endpoints implied by doc 11's API sketch (`GET /customers/:id/orders`,
  `/quotations`, `/documents`) — the underlying per-module `list({customerId})` filters already exist and
  make this a thin controller-composition addition whenever it's needed, but it isn't wired yet.
- AI Customer Profile, AI Product Expert, AI Pricing, AI Trading Assistant — seams only (§15).
- Margin-threshold/discount-limit Rules Engine rules are not pre-authored — the mechanism exists (§4) but no
  company-specific rule is seeded.
