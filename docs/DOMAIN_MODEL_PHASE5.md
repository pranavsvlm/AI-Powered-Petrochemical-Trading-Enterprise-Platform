# Phase 5 Domain Model — Ratified Decisions

Inventory, Procurement & Finance: `modules/inventory` (doc 16), `modules/procurement` (doc 17), and
`modules/accounting` (doc 14) — "close the loop from order to fulfillment to financial recognition." This
document is the source of truth for Phase 5 code, the same way `DOMAIN_MODEL_PHASE1.md` through
`DOMAIN_MODEL_PHASE4.md` are for their phases. Docs 14/16/17 are, like every doc before them, terse: entity
names and lifecycle arrows with no concrete states, transitions, or field lists — inventing and ratifying
those is the core work of this document. Phase 5 also introduces two mechanisms with **no prior precedent
anywhere in this codebase**: a race-safe concurrency primitive (§5) and a saga with an explicit compensating
action (§12).

## 1. `modules/trading` stays deferred

None of Phase 5's four acceptance criteria (race-safe reservation, requisition→PO→receipt, invoices/AR/AP/
trial-balance/P&L, the Order→Invoice→Inventory saga) need Contracts, Shipments, or a live FX feed. Those
stay exactly where `DOMAIN_MODEL_PHASE4.md` §2 left them, still deferred, still not seeded into any
`PHASE*_MODULES` list. Only `modules/inventory`/`modules/procurement`/`modules/accounting` are in scope this
phase.

## 2. `Warehouse` is a new model, not a reuse of `Branch`

`Branch` already has a `WAREHOUSE` value in its `BranchType` enum (Phase 1), but no capacity, manager, or
address-detail fields doc 16 wants for a real warehouse record. **Decision: `Warehouse` is its own model**,
with an optional nullable `branchId` purely for colocation ("this warehouse sits at this branch's site") —
never conflated with `Branch` itself, and never required (a company can have warehouses with no matching
branch row).

## 3. Doc 16's hierarchy collapses to just `Warehouse`

Doc 16's own entity list only ever names `Warehouse`/`WarehouseZone`/`WarehouseBin` — it doesn't even mention
Aisle or Rack despite alluding to a deeper hierarchy in prose. None of the four acceptance criteria need
bin-level granularity: reservation, receipt, and stock adjustment all operate at the
company+product+warehouse level. **`WarehouseZone`/`WarehouseBin` are deferred**, along with periodic
`PhysicalCount`/cycle-count tooling (doc 16 names it, but nothing in Phase 5's scope reads or writes it).

## 4. Single warehouse per order, and `OrderLineItem.warehouseId`

`OrderLineItem` gains a nullable `warehouseId`. `OrderService.createDirect`/`.createFromQuotation` accept an
optional `warehouseId` argument, defaulting to the company's `Warehouse.isDefault` row when omitted
(`InventoryService.getDefaultWarehouseId`, which throws a clear `BadRequestException` if the company hasn't
marked any warehouse default yet — a one-time setup precondition, not a bug). `warehouseId` is nullable at
the schema level only because a pre-Phase-5 order row has none; every Phase-5-created line item always
resolves one before the reservation step runs. This single-warehouse-per-order simplification is also what
makes §5's concurrency test literal: many concurrent orders competing for one product in one warehouse.

## 5. The atomic reservation primitive

The race-safety requirement is met with a single raw-SQL conditional `UPDATE`, not a `SELECT FOR UPDATE` or
`SERIALIZABLE` transaction:

```sql
UPDATE inventory_items
SET quantity_reserved = quantity_reserved + $qty, updated_at = now()
WHERE id = $id AND company_id = $companyId AND (quantity_on_hand - quantity_reserved) >= $qty
```

(`InventoryRepository.atomicReserve`, called from `InventoryService.reserve`.) Postgres's row-level `UPDATE`
semantics already serialize concurrent writers targeting the same row: the second transaction's `UPDATE`
blocks until the first commits, then re-evaluates its own `WHERE` clause against the now-current value —
there is no lost-update window between a read and a write because there is no separate read. Checking the
statement's affected-row count (0 ⇒ insufficient stock, throw `InsufficientStockException`) is therefore
both necessary and sufficient; no additional locking is needed. **Because `$executeRaw` is not intercepted by
the tenant extension** (`packages/database/src/tenant-extension.ts` only wraps model-delegate operations,
confirmed by direct inspection before writing this primitive), `company_id` is included in the `WHERE` clause
by hand — a deliberate, load-bearing bypass, not an oversight. `inventory-reservation-concurrency.e2e-spec.ts`
is the actual proof: 20 concurrent `OrderService.createDirect` calls for 10 units each against 100 on-hand
resolve to exactly 10 fulfilled / 10 rejected, deterministically, across repeated runs against real Postgres.

## 6. Cross-module shared transaction: extending the lookup-port pattern to writes

Until now (`DOMAIN_MODEL_PHASE4.md` §11), narrow ports only ever wrapped **reads** (`getById`,
`getForOrderCreation`). Reservation needs the order-creation write and the reservation write to be one
atomic unit, so `InventoryReservePort.reserve` takes the caller's own `TenantScopedTransactionClient` as its
first argument:

```ts
reserve(tx, companyId, orderId, lines, warehouseId?): Promise<void>
```

`OrderService.createDirect`/`.createFromQuotation` open `this.db.$transaction(async (tx) => …)`, pass `tx`
into both `OrderRepository.create(input, tx)` and `inventoryReserve.reserve(tx, …)`, and let a thrown
`InsufficientStockException` roll back the whole transaction — the order row itself never persists if
reservation fails. `InventoryService`/`InventoryRepository` remain the only code that ever constructs a
query against `inventory_items`/`stock_reservations`; `OrderService` never touches those tables directly.
This is a deliberate, narrow extension of the Phase 4 lookup-port convention, not a violation of it.

## 7. `InventoryMovement` is a real tenant-scoped aggregate; `InventoryBatch` stays a pure child

`InventoryMovement` gets its own `companyId` + `Company` FK and a slot in `TENANT_SCOPED_MODELS` — it's an
append-only ledger meant to be queried directly ("stock-card report for company X"), the same shape as
`ApprovalRequest`. `InventoryBatch` stays a pure child, always reached via `inventoryItemId` (mirrors
`OrderLineItem`/`QuotationLineItem`'s existing precedent for rows scoped transitively through their parent).

`InventoryMovementType` semantics: `RECEIPT` (goods receipt increases on-hand), `DISPATCH` (**stock
permanently allocated away from available inventory at order-confirmation commit time** — not physical
warehouse dispatch, which is unchanged and still tracked via `OrderLineItem.fulfilledQuantity`/
`OrderService.fulfillLine()`), `ADJUSTMENT` (manual `StockAdjustment`), `RESERVATION_RELEASE` (an `ACTIVE`
reservation released without ever being committed — see §9), `REVERSAL` (the saga's compensating action,
§12). Reserving stock itself is deliberately **not** logged as a movement — it changes `quantityReserved`,
not `quantityOnHand`, and none of the five movement types fit "reservation created"; only its two possible
resolutions (release or commit/dispatch) are ledger events.

## 8. `StockReservation` lifecycle and scope

`StockReservation` is real tenant-scoped (needed for "list this company's active reservations," and because
it's the exact row the atomic `UPDATE` in §5 stamps), one reservation per order line item
(`@@unique([orderLineItemId])` — no split/partial reservations in Phase 5). Lifecycle: `ACTIVE → RELEASED`
or `ACTIVE → COMMITTED`, both terminal (`modules/inventory/domain/reservation-lifecycle.ts`).

## 9. Automatic release is scoped to PENDING_CONFIRMATION → CANCELLED only

`OrderService.cancel()` calls `InventoryReleasePort.release(companyId, orderId)` **only when the order was
still `PENDING_CONFIRMATION`** at the moment of cancellation — the one case where its reservations are
still `ACTIVE` and nothing has been physically dispatched. Cancelling a `CONFIRMED`/`PARTIALLY_FULFILLED`/
`ON_HOLD` order does **not** reverse its already-committed inventory dispatch in Phase 5 — by that point the
saga (§12) has already converted the reservation to `COMMITTED` and decremented `quantityOnHand` for real,
and unwinding a physical dispatch on cancellation is a distinct, harder problem (partial fulfillment,
already-shipped stock) that the four acceptance criteria don't require solving. This is an explicit scope
boundary, not an oversight — see §15.

## 10. Procurement scope: `Supplier` mirrors `Customer`, `QualityInspection` folds into a line field

`Supplier`/`SupplierContact` are an exact field-shape mirror of Phase 4's `Customer`/`Contact`, minus the
approval-gated `PENDING_APPROVAL` status (no acceptance criterion needs a supplier-onboarding approval gate,
only `PurchaseRequisition`/`PurchaseOrder` do — `modules/procurement/domain/supplier-lifecycle.ts` is
correspondingly simpler: `PROSPECT → ACTIVE ⇄ SUSPENDED`, `→ ARCHIVED` from any state). `PurchaseOrder` can
be created directly or from an approved `PurchaseRequisition` (`requisitionId` nullable, mirroring
`Order.quotationId`'s precedent exactly). Doc 17's `QualityInspection` is folded into
`GoodsReceiptItem.inspectionResult` (`PENDING | PASSED | FAILED`) rather than built as a separate entity —
only `PASSED` lines ever call `InventoryReceiptPort.recordReceipt`, so a failed line is received (creates the
`GoodsReceiptItem` row, for audit purposes) but never touches `InventoryItem.quantityOnHand`,
`InventoryBatch`, or the PO's own received-quantity tracking (`PurchaseOrderItem.receivedQuantity` only
increments for `PASSED` lines — a rejected shipment isn't "received" in the fulfillment sense).

**Deferred**: `SupplierRFQ`/`SupplierQuotation` (a second RFQ-comparison subsystem — "AI Comparison" is an AI
seam per §13 anyway, not a data-modeling requirement), `SupplierCertification`, `SupplierContract`.

## 11. Requisition and PurchaseOrder state machines

Neither doc names a concrete state machine; these are the ratified ones
(`modules/procurement/domain/{requisition-lifecycle,purchase-order-lifecycle,po-receipt-status}.ts`):

- `PurchaseRequisitionStatus`: `DRAFT → SUBMITTED → APPROVED → CONVERTED`, `SUBMITTED → REJECTED → DRAFT`
  (reopens for revision, mirroring `DocumentService`'s reopen-on-reject precedent), `CANCELLED` reachable
  from `DRAFT`/`SUBMITTED`/`APPROVED`.
- `PurchaseOrderStatus`: `DRAFT → PENDING_APPROVAL → APPROVED → SENT → {PARTIALLY_RECEIVED → RECEIVED} →
CLOSED`, `PENDING_APPROVAL → DRAFT` on rejection (same reopen precedent). `PARTIALLY_RECEIVED`/`RECEIVED`
  are **derived**, never chosen directly by a caller — `computeAggregateReceiptStatus` (mirrors Phase 4's
  `computeAggregateFulfillmentStatus`) recomputes them from `PurchaseOrderItem.receivedQuantity` vs.
  `quantity` every time `GoodsReceiptService` records a `PASSED` line.
- Both requisition submission and PO approval delegate to the Rules Engine via
  `ApprovalEvaluator.evaluateApproval(companyId, 'procurement', {...})` — the single `'procurement'` module
  key covers both (see §14's permission table), not two separate rule namespaces.

## 12. The confirmation saga, in full

`OrderService`'s existing `confirm()` and `decideApproval()`'s `APPROVED` branch **both** transition an order
to `CONFIRMED` (verified directly in the Phase-4-era code before writing this) — the saga therefore runs from
a single shared private method, `runConfirmationSaga(order, actorUserId)`, called from both sites:

1. Order transitions to `CONFIRMED` (existing behavior, unchanged).
2. `InventoryCommitPort.commit(companyId, orderId)` — converts the order's `ACTIVE` reservations to
   `COMMITTED`, decrementing `quantityOnHand` together with `quantityReserved` (a real `DISPATCH` movement,
   §7).
3. `InvoicingPort.generateInvoiceForOrder(orderSnapshot, actorUserId)` — builds `Invoice` + `InvoiceItem[]` +
   a balanced AR `Journal` (debit Accounts Receivable `1100`, credit Sales Revenue `4000`) in one
   transaction.
4. **If step 3 throws**: `InventoryCommitPort.reverseCommit(companyId, orderId)` runs (a `REVERSAL`
   movement undoing step 2's decrement), then the error is re-thrown.

**`Order.status` is never rolled back**, even on failure. A single cross-module transaction spanning
Orders/Inventory/Accounting tables is technically possible in this one-Postgres-instance monolith, but would
defeat the acceptance criterion itself — there would be no saga left to document, and no detectable failure
state. `CONFIRMED` + reverted-inventory + no-`Invoice` is instead a **detectable, reconcilable** state
(queryable: "orders CONFIRMED with no matching Invoice row"), which is more correct than silently
un-confirming an order a customer may already have been told about. The recovery path is manual retry —
`OrderService.retryInvoiceGeneration(orderId, actorUserId)`, exposed as `POST /orders/:id/retry-invoice` —
not an automatic background reconciliation job (explicitly out of scope, §15). The failure branch itself is
tested deterministically with a mocked `InvoicingPort` in
`modules/orders/application/order.service.spec.ts` (asserting `reverseCommit` is called with the right args,
the error re-throws, and `Order.status` is never touched again) rather than via a live-infra failure
injection, which would be inherently flaky.

**Why `InvoicingPort` takes an order snapshot by value, not an `orderId` + lookup callback**: the natural
mirror of Phase 4's lookup-port convention would have `InvoiceService` call back into `OrderService` via an
`OrderLookupPort`. But `OrdersModule` already needs to import `AccountingModule` for `InvoicingPort`/step 3 —
if `AccountingModule` also imported `OrdersModule` for that lookup, the two modules would form a genuine
circular dependency (not the diamond-shaped shared-dependency shape Phase 4 modules already have, e.g.
several modules importing `ProductsModule`). Since `OrderService` is the **only** caller of
`generateInvoiceForOrder` and already holds the just-confirmed order's full data in hand, `InvoicingPort`
takes an `OrderSnapshotForInvoicing` value object instead of an id — `InvoiceService`/`AccountingModule` end
up with **no dependency on `@modules/orders` at all**, which is a better design on its own merits, not just a
workaround.

## 13. Accounting: double-entry invariant, money representation, and computed reports

`assertJournalBalances` (`modules/accounting/domain/journal-balance.ts`) enforces `sum(debit) ==
sum(credit)` at cents-rounding precision (`Math.round(amount * 100)`) before any `Journal` row is created —
this specifically handles the classic `0.1 + 0.2 !== 0.3` floating-point case, covered by its own unit test.
Money stays a plain `number` throughout the accounting layer (`Number(li.totalAmount)` etc.), matching the
convention every other module already uses — this is an accepted, pre-existing-class limitation carried
forward, not a new one introduced by Phase 5. **Trial Balance and P&L are computed read-side reports**
(`aggregateTrialBalance`/`computeProfitAndLoss`, pure functions over `ChartOfAccount` + `JournalLine`), never
stored entities — there is nothing to keep in sync because nothing is cached. `ChartOfAccountsService.
seedDefaultChart` is idempotent and creates 7 accounts (`1000` Cash, `1100` AR, `1200` Inventory, `2000` AP,
`3000` Retained Earnings, `4000` Sales Revenue, `5000` COGS) — `InvoiceService` posts against `1100`/`4000`,
`SupplierBillService` against `1200`/`2000`; both throw a clear `BadRequestException` if the company hasn't
seeded its chart yet, rather than silently posting to nonexistent accounts.

`Payment.entityType`/`entityId` is genuinely polymorphic (only `'Invoice'` is written in Phase 5, ready for
`'SupplierBill'` AP-side payments later) — deliberately **no** relation/FK on `entityId`, the same treatment
`ApprovalRequest.entityId`/`InventoryMovement.entityId`/`Document.entityId` already established. By
contrast, `Invoice.orderId`, `SupplierBill.purchaseOrderId`/`.supplierId`, and `GoodsReceipt.warehouseId` are
real single-purpose Prisma FKs (never polymorphic), consistent with `DOMAIN_MODEL_PHASE4.md` §11's rule that
cross-module FKs are fine — only genuinely polymorphic entityType/entityId pairs must avoid a hard FK
constraint, since the same column would otherwise point at different tables depending on context.

## 14. Permission mapping table

`PHASE5_MODULES = ['inventory', 'procurement', 'accounting']` in `packages/permissions/src/rbac/
seed-data.ts`, spliced into `SEED_PERMISSIONS` alongside `PHASE1_MODULES` through `PHASE4_MODULES`. No new
roles were needed — `INVENTORY_MANAGER`/`PROCUREMENT_MANAGER`/`FINANCE_MANAGER` already exist in
`SYSTEM_ROLES.company` since Phase 1, unused until now.

| Doc permission (prose)                               | `module:action`                  |
| ---------------------------------------------------- | -------------------------------- |
| View/Create/Edit Warehouse, Stock, Movements         | `inventory:view\|create\|edit`   |
| Adjust Stock                                         | `inventory:edit`                 |
| View/Create/Edit Supplier, Requisition, PO, Receipt  | `procurement:view\|create\|edit` |
| Approve Requisition / Approve PO                     | `procurement:approve`            |
| View/Create Chart of Accounts, Journals, Invoices... | `accounting:view\|create`        |
| Seed Default Chart of Accounts                       | `accounting:manage_settings`     |

## 15. Explicitly out of scope for Phase 5 (carried into later phases)

- `modules/trading` in full — still deferred (§1), unchanged from `DOMAIN_MODEL_PHASE4.md` §2.
- `WarehouseZone`/`WarehouseBin` bin-level tracking, and `PhysicalCount`/cycle-count tooling (§3).
- Reversing an already-committed inventory dispatch when a `CONFIRMED`/later-status order is cancelled (§9)
  — only the `PENDING_CONFIRMATION → CANCELLED` path releases reservations.
- `SupplierRFQ`/`SupplierQuotation`, `SupplierCertification`, `SupplierContract` (§10).
- A background reconciliation job for the saga's one known failure state (CONFIRMED + reverted-inventory +
  no-Invoice) — the recovery path is `OrderService.retryInvoiceGeneration`, a manual/operator action (§12).
- `BankAccount`/`BankTransaction`/reconciliation, a live `Currency`/`ExchangeRate` feed (consistent with
  Phase 4's own no-live-FX deferral), `TaxCode`, `Budget` — none of doc 14's stretch entities are required by
  the trial-balance/P&L acceptance criterion.
- Split/partial reservations (one `StockReservation` per order line item, always the full quantity, §8).
- A dedicated invoice/PO numbering sequence service — `Invoice.invoiceNumber` is derived from the order's own
  `orderNumber` (`INV-{orderNumber}`), `SupplierBill.billNumber` from the PO's `poNumber`
  (`BILL-{poNumber}`), the same "caller/predecessor-supplied, not auto-generated" treatment
  `DOMAIN_MODEL_PHASE4.md` §17 gave RFQ/Quotation/Order numbers.
- `Payment` against `SupplierBill` (AP payments) — the polymorphic shape supports it (§13), but only the AR
  (`Invoice`) side is wired to a controller in Phase 5.
