import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type {
  TenantScopedPrismaClient,
  TenantScopedTransactionClient,
  Order,
  OrderStatus,
  UnitOfMeasure,
  Incoterm,
  ApprovalRequest,
} from '@platform/database';
import {
  assertOrderTransition,
  computeAggregateFulfillmentStatus,
} from '../domain/order-lifecycle';
import {
  OrderRepository,
  type OrderLineItemInput,
  type OrderWithLineItems,
} from '../infrastructure/order.repository';

export interface OrderAuditWriter {
  record(entry: {
    companyId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void>;
}

export interface OrderEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/** Narrow slice of RuleEvaluationService's public API — see docs/DOMAIN_MODEL_PHASE4.md. */
export interface ApprovalEvaluator {
  evaluateApproval(
    companyId: string,
    module: string,
    attributes: Record<string, unknown>,
  ): Promise<{
    approvers: Array<{ ruleId: string; [key: string]: unknown }>;
    matchedRuleIds: string[];
  }>;
}

/**
 * Published by @modules/quotations, satisfied at NestJS wiring time by
 * QuotationService.getForOrderCreation — never queried directly against quotations' tables.
 */
export interface QuotationLookupPort {
  getForOrderCreation(quotationId: string): Promise<{
    id: string;
    customerId: string;
    currency: string;
    currentVersionNumber: number;
    versions: Array<{
      versionNumber: number;
      lineItems: Array<{
        productId: string;
        quantity: unknown;
        uom: string;
        unitPrice: unknown;
        lineTotal: unknown;
      }>;
    }>;
  }>;
  /** Marks the source quotation CONVERTED once its order exists — see QuotationService.convertToOrder. */
  markConverted(quotationId: string, actorUserId: string): Promise<void>;
}

/**
 * Published by @modules/customers, satisfied by CustomerService.getById — already
 * tenant-scoped, so calling it (rather than trusting the raw customerId a caller supplies) is
 * what actually rejects a cross-tenant customerId on the direct-order path.
 */
export interface CustomerLookupPort {
  getById(customerId: string): Promise<{ id: string }>;
}

/** Published by @modules/products, satisfied by ProductService.getById — same tenant-scoping reasoning. */
export interface ProductLookupPort {
  getById(productId: string): Promise<{ id: string }>;
}

/**
 * Published by @modules/inventory, satisfied by InventoryService.reserve — called inside this
 * service's own `db.$transaction(...)` so the reservation writes participate in the same
 * atomic unit as the order-creation write. See docs/DOMAIN_MODEL_PHASE5.md.
 */
export interface InventoryReservePort {
  reserve(
    tx: TenantScopedTransactionClient,
    companyId: string,
    orderId: string,
    lines: Array<{ orderLineItemId: string; productId: string; quantity: number }>,
    warehouseId?: string,
  ): Promise<void>;
}

/** Published by @modules/inventory, satisfied by InventoryService.release. Only called from cancel() while still PENDING_CONFIRMATION. */
export interface InventoryReleasePort {
  release(companyId: string, orderId: string): Promise<void>;
}

/** Published by @modules/inventory, satisfied by InventoryService — the confirmation saga's step 2/compensation. */
export interface InventoryCommitPort {
  commit(companyId: string, orderId: string): Promise<void>;
  reverseCommit(companyId: string, orderId: string): Promise<void>;
}

/** The order snapshot InvoicingPort needs — passed by value, see @modules/accounting's InvoiceService for why. */
export interface OrderSnapshotForInvoicing {
  id: string;
  companyId: string;
  orderNumber: string;
  customerId: string;
  currency: string;
  subtotal: number;
  totalAmount: number;
  lineItems: Array<{ productId: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

/** Published by @modules/accounting, satisfied by InvoiceService.generateInvoiceForOrder — the confirmation saga's step 3. */
export interface InvoicingPort {
  generateInvoiceForOrder(order: OrderSnapshotForInvoicing, actorUserId: string): Promise<void>;
}

export interface CreateOrderDirectInput {
  orderNumber: string;
  customerId: string;
  currency: string;
  incoterm?: Incoterm;
  warehouseId?: string;
  lineItems: Array<{ productId: string; quantity: number; uom: UnitOfMeasure; unitPrice: number }>;
}

/**
 * Application-layer use cases for the Order aggregate (doc 13): confirmation, fulfillment
 * tracking, and amendments. Approval (the direct-order-without-quotation path doc 13 separately
 * names "Approve Order" for) is delegated to the Rules Engine, never reimplemented here — see
 * docs/DOMAIN_MODEL_PHASE3.md §6 and docs/DOMAIN_MODEL_PHASE4.md.
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private readonly repo: OrderRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly approvalEvaluator: ApprovalEvaluator,
    private readonly events: OrderEventPublisher,
    private readonly audit: OrderAuditWriter,
    private readonly quotations: QuotationLookupPort,
    private readonly customers: CustomerLookupPort,
    private readonly products: ProductLookupPort,
    private readonly inventoryReserve: InventoryReservePort,
    private readonly inventoryRelease: InventoryReleasePort,
    private readonly inventoryCommit: InventoryCommitPort,
    private readonly invoicing: InvoicingPort,
  ) {
    this.repo = new OrderRepository(db);
  }

  async createFromQuotation(
    companyId: string,
    orderNumber: string,
    quotationId: string,
    actorUserId: string,
    ipAddress?: string | null,
    warehouseId?: string,
  ): Promise<Order> {
    const quotation = await this.quotations.getForOrderCreation(quotationId);
    const currentVersion = quotation.versions.find(
      (v) => v.versionNumber === quotation.currentVersionNumber,
    );
    if (!currentVersion)
      throw new BadRequestException('Quotation has no current version to order from.');

    const lineItems: OrderLineItemInput[] = currentVersion.lineItems.map((li) => ({
      productId: li.productId,
      quantity: Number(li.quantity),
      uom: li.uom as UnitOfMeasure,
      unitPrice: Number(li.unitPrice),
      lineTotal: Number(li.lineTotal),
    }));
    const totalAmount = lineItems.reduce((sum, l) => sum + l.lineTotal, 0);

    const order = await this.db.$transaction(async (tx) => {
      const created = await this.repo.create(
        {
          companyId,
          orderNumber,
          customerId: quotation.customerId,
          quotationId,
          currency: quotation.currency,
          createdByUserId: actorUserId,
          lineItems,
          subtotal: totalAmount,
          totalAmount,
        },
        tx,
      );
      await this.inventoryReserve.reserve(
        tx,
        companyId,
        created.id,
        created.lineItems.map((li) => ({
          orderLineItemId: li.id,
          productId: li.productId,
          quantity: Number(li.quantity),
        })),
        warehouseId,
      );
      return created;
    });

    await this.quotations.markConverted(quotationId, actorUserId);

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.ORDER_CREATED,
      entityType: 'Order',
      entityId: order.id,
      after: { orderNumber, quotationId, totalAmount },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.ORDER_CREATED,
      companyId,
      { orderId: order.id, quotationId, totalAmount },
      'orders',
    );
    return order;
  }

  async createDirect(
    companyId: string,
    input: CreateOrderDirectInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Order> {
    await this.customers.getById(input.customerId);
    await Promise.all(input.lineItems.map((li) => this.products.getById(li.productId)));

    const lineItems: OrderLineItemInput[] = input.lineItems.map((li) => ({
      productId: li.productId,
      quantity: li.quantity,
      uom: li.uom,
      unitPrice: li.unitPrice,
      lineTotal: li.quantity * li.unitPrice,
    }));
    const totalAmount = lineItems.reduce((sum, l) => sum + l.lineTotal, 0);

    const order = await this.db.$transaction(async (tx) => {
      const created = await this.repo.create(
        {
          companyId,
          orderNumber: input.orderNumber,
          customerId: input.customerId,
          currency: input.currency,
          incoterm: input.incoterm,
          createdByUserId: actorUserId,
          lineItems,
          subtotal: totalAmount,
          totalAmount,
        },
        tx,
      );
      await this.inventoryReserve.reserve(
        tx,
        companyId,
        created.id,
        created.lineItems.map((li) => ({
          orderLineItemId: li.id,
          productId: li.productId,
          quantity: Number(li.quantity),
        })),
        input.warehouseId,
      );
      return created;
    });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.ORDER_CREATED,
      entityType: 'Order',
      entityId: order.id,
      after: { orderNumber: input.orderNumber, totalAmount },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.ORDER_CREATED,
      companyId,
      { orderId: order.id, totalAmount },
      'orders',
    );
    return order;
  }

  async getById(id: string): Promise<OrderWithLineItems> {
    const order = await this.repo.findById(id);
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  private toInvoiceSnapshot(order: OrderWithLineItems): OrderSnapshotForInvoicing {
    return {
      id: order.id,
      companyId: order.companyId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      currency: order.currency,
      subtotal: Number(order.subtotal),
      totalAmount: Number(order.totalAmount),
      lineItems: order.lineItems.map((li) => ({
        productId: li.productId,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        lineTotal: Number(li.lineTotal),
      })),
    };
  }

  /**
   * The confirmation saga (docs/DOMAIN_MODEL_PHASE5.md): commit inventory (converting this
   * order's ACTIVE reservations to a permanent dispatch), then generate the AR invoice. If
   * invoice generation fails, the inventory commit is compensated (reversed) and the error
   * re-thrown — Order.status itself is never rolled back; CONFIRMED + reverted-inventory +
   * no-invoice is a detectable, reconcilable state, not silently swallowed.
   */
  private async runConfirmationSaga(order: OrderWithLineItems, actorUserId: string): Promise<void> {
    await this.inventoryCommit.commit(order.companyId, order.id);
    try {
      await this.invoicing.generateInvoiceForOrder(this.toInvoiceSnapshot(order), actorUserId);
    } catch (err) {
      await this.inventoryCommit.reverseCommit(order.companyId, order.id);
      throw err;
    }
  }

  /**
   * The documented manual-retry path for the saga's one known failure mode (order CONFIRMED,
   * inventory reverted, no Invoice) — see docs/DOMAIN_MODEL_PHASE5.md. Only OrderService holds
   * both the order snapshot and the InvoicingPort, so this lives here rather than on Accounting.
   */
  async retryInvoiceGeneration(orderId: string, actorUserId: string): Promise<void> {
    const order = await this.getById(orderId);
    if (order.status === 'PENDING_CONFIRMATION') {
      throw new BadRequestException('Cannot generate an invoice before the order is confirmed.');
    }
    await this.invoicing.generateInvoiceForOrder(this.toInvoiceSnapshot(order), actorUserId);
  }

  list(filters: {
    companyId: string;
    status?: OrderStatus;
    customerId?: string;
  }): Promise<Order[]> {
    return this.repo.list(filters);
  }

  private async transition(
    id: string,
    to: OrderStatus,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Order> {
    const before = await this.getById(id);
    assertOrderTransition(before.status, to);
    const updated = await this.repo.updateStatus(id, to);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.ORDER_STATUS_CHANGED,
      entityType: 'Order',
      entityId: id,
      before: { status: before.status },
      after: { status: to },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.ORDER_STATUS_CHANGED,
      before.companyId,
      { orderId: id, status: to },
      'orders',
    );
    return updated;
  }

  async confirm(id: string, actorUserId: string, ipAddress?: string | null): Promise<Order> {
    const updated = await this.transition(id, 'CONFIRMED', actorUserId, ipAddress);
    const order = await this.getById(id);
    await this.runConfirmationSaga(order, actorUserId);
    return updated;
  }

  hold(id: string, actorUserId: string, ipAddress?: string | null): Promise<Order> {
    return this.transition(id, 'ON_HOLD', actorUserId, ipAddress);
  }

  release(id: string, actorUserId: string, ipAddress?: string | null): Promise<Order> {
    return this.transition(id, 'CONFIRMED', actorUserId, ipAddress);
  }

  /**
   * Only a still-PENDING_CONFIRMATION order has ACTIVE (uncommitted) reservations to release —
   * once CONFIRMED, the saga has already dispatched the stock for real, and reversing that is
   * explicitly out of scope for Phase 5. See docs/DOMAIN_MODEL_PHASE5.md.
   */
  async cancel(id: string, actorUserId: string, ipAddress?: string | null): Promise<Order> {
    const before = await this.getById(id);
    const updated = await this.transition(id, 'CANCELLED', actorUserId, ipAddress);
    if (before.status === 'PENDING_CONFIRMATION') {
      await this.inventoryRelease.release(before.companyId, id);
    }
    return updated;
  }

  close(id: string, actorUserId: string, ipAddress?: string | null): Promise<Order> {
    return this.transition(id, 'CLOSED', actorUserId, ipAddress);
  }

  async fulfillLine(
    orderId: string,
    lineItemId: string,
    fulfilledQuantity: number,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Order> {
    const before = await this.getById(orderId);
    if (before.status !== 'CONFIRMED' && before.status !== 'PARTIALLY_FULFILLED') {
      throw new BadRequestException(`Cannot fulfill a line item while order is ${before.status}.`);
    }
    await this.repo.setLineFulfilledQuantity(lineItemId, fulfilledQuantity);
    const lineItems = await this.repo.listLineItems(orderId);
    const nextStatus = computeAggregateFulfillmentStatus(
      lineItems.map((l) => ({
        quantity: Number(l.quantity),
        fulfilledQuantity: Number(l.fulfilledQuantity),
      })),
    );

    let updated: Order = before;
    if (nextStatus !== before.status) {
      assertOrderTransition(before.status, nextStatus);
      updated = await this.repo.updateStatus(orderId, nextStatus);
      await this.events.publish(
        EVENT_TYPES.ORDER_STATUS_CHANGED,
        before.companyId,
        { orderId, status: nextStatus },
        'orders',
      );
    }

    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.ORDER_STATUS_CHANGED,
      entityType: 'Order',
      entityId: orderId,
      after: { lineItemId, fulfilledQuantity, status: nextStatus },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  /** Records the amendment as an audit before/after diff — no separate OrderAmendment table. */
  async amend(
    id: string,
    data: Partial<{ incoterm: Incoterm; currency: string }>,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Order> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, data);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType: AuditEventType.ORDER_UPDATED,
      entityType: 'Order',
      entityId: id,
      before: { incoterm: before.incoterm, currency: before.currency },
      after: { incoterm: updated.incoterm, currency: updated.currency },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  /** Delegates approval resolution to the Rules Engine — never reimplemented here. */
  async requestApproval(
    orderId: string,
    actorUserId: string,
    attributes: Record<string, unknown> = {},
  ): Promise<ApprovalRequest[]> {
    const order = await this.getById(orderId);
    const { approvers } = await this.approvalEvaluator.evaluateApproval(order.companyId, 'orders', {
      ...attributes,
      orderId,
      orderValue: Number(order.totalAmount),
      currency: order.currency,
    });

    if (approvers.length === 0) return [];

    return Promise.all(
      approvers.map((a) =>
        this.repo.createApproval({
          companyId: order.companyId,
          orderId,
          approverRoleId: typeof a.approverRoleId === 'string' ? a.approverRoleId : undefined,
          approverUserId: typeof a.approverUserId === 'string' ? a.approverUserId : undefined,
        }),
      ),
    );
  }

  async decideApproval(
    approvalId: string,
    decision: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    comment?: string,
    ipAddress?: string | null,
  ): Promise<ApprovalRequest> {
    const approval = await this.repo.findApproval(approvalId);
    if (!approval) throw new NotFoundException('Approval not found.');
    const updated = await this.repo.decideApproval(approvalId, decision, comment);
    const order = await this.getById(approval.entityId);

    if (decision === 'APPROVED') {
      await this.repo.updateStatus(approval.entityId, 'CONFIRMED');
      const confirmed = await this.getById(approval.entityId);
      await this.runConfirmationSaga(confirmed, actorUserId);
    }
    await this.audit.record({
      companyId: order.companyId,
      actorUserId,
      eventType: AuditEventType.ORDER_STATUS_CHANGED,
      entityType: 'Order',
      entityId: approval.entityId,
      after: { decision },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }
}
