import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type {
  TenantScopedPrismaClient,
  PurchaseOrder,
  PurchaseOrderStatus,
  UnitOfMeasure,
  ApprovalRequest,
} from '@platform/database';
import { assertPurchaseOrderTransition } from '../domain/purchase-order-lifecycle';
import { computeAggregateReceiptStatus } from '../domain/po-receipt-status';
import {
  PurchaseOrderRepository,
  type PurchaseOrderLineItemInput,
} from '../infrastructure/procurement.repository';
import type { SupplierLookupPort } from './supplier.service';
import type { ProductLookupPort, RequisitionLookupPort } from './requisition.service';

export interface PurchaseOrderAuditWriter {
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

export interface PurchaseOrderEventPublisher {
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

/** Published to @modules/accounting's SupplierBillService — satisfied by PurchaseOrderService.getById. */
export interface PurchaseOrderLookupPort {
  getById(purchaseOrderId: string): Promise<{
    id: string;
    companyId: string;
    poNumber: string;
    supplierId: string;
    currency: string;
    totalAmount: unknown;
  }>;
}

export interface CreatePurchaseOrderDirectInput {
  poNumber: string;
  supplierId: string;
  currency: string;
  lineItems: Array<{ productId: string; quantity: number; uom: UnitOfMeasure; unitPrice: number }>;
}

/**
 * Application-layer use cases for the PurchaseOrder aggregate (doc 17): creation (direct or
 * from an approved requisition), its own approval gate, sending, and receipt-driven status.
 * Approval is delegated to the Rules Engine, never reimplemented here.
 */
@Injectable()
export class PurchaseOrderService implements PurchaseOrderLookupPort {
  private readonly logger = new Logger(PurchaseOrderService.name);
  private readonly repo: PurchaseOrderRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly approvalEvaluator: ApprovalEvaluator,
    private readonly events: PurchaseOrderEventPublisher,
    private readonly audit: PurchaseOrderAuditWriter,
    private readonly suppliers: SupplierLookupPort,
    private readonly products: ProductLookupPort,
    private readonly requisitions: RequisitionLookupPort,
  ) {
    this.repo = new PurchaseOrderRepository(db);
  }

  async createDirect(
    companyId: string,
    input: CreatePurchaseOrderDirectInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PurchaseOrder> {
    await this.suppliers.getById(input.supplierId);
    await Promise.all(input.lineItems.map((li) => this.products.getById(li.productId)));

    const lineItems: PurchaseOrderLineItemInput[] = input.lineItems.map((li) => ({
      productId: li.productId,
      quantity: li.quantity,
      uom: li.uom,
      unitPrice: li.unitPrice,
      lineTotal: li.quantity * li.unitPrice,
    }));
    const totalAmount = lineItems.reduce((sum, l) => sum + l.lineTotal, 0);

    const po = await this.repo.create({
      companyId,
      poNumber: input.poNumber,
      supplierId: input.supplierId,
      currency: input.currency,
      createdByUserId: actorUserId,
      lineItems,
      subtotal: totalAmount,
      totalAmount,
    });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.PURCHASE_ORDER_CREATED,
      entityType: 'PurchaseOrder',
      entityId: po.id,
      after: { poNumber: input.poNumber, totalAmount },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.PURCHASE_ORDER_CREATED,
      companyId,
      { purchaseOrderId: po.id, totalAmount },
      'procurement',
    );
    return po;
  }

  /** unitPrice defaults to the requisition line's estimatedUnitPrice — use createDirect for a negotiated price. */
  async createFromRequisition(
    companyId: string,
    poNumber: string,
    requisitionId: string,
    supplierId: string,
    currency: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PurchaseOrder> {
    await this.suppliers.getById(supplierId);
    const requisition = await this.requisitions.getForPurchaseOrderCreation(requisitionId);

    const lineItems: PurchaseOrderLineItemInput[] = requisition.lineItems.map((li) => {
      const unitPrice = Number(li.estimatedUnitPrice ?? 0);
      const quantity = Number(li.quantity);
      return {
        productId: li.productId,
        quantity,
        uom: li.uom as UnitOfMeasure,
        unitPrice,
        lineTotal: quantity * unitPrice,
      };
    });
    const totalAmount = lineItems.reduce((sum, l) => sum + l.lineTotal, 0);

    const po = await this.repo.create({
      companyId,
      poNumber,
      supplierId,
      requisitionId,
      currency,
      createdByUserId: actorUserId,
      lineItems,
      subtotal: totalAmount,
      totalAmount,
    });

    await this.requisitions.markConverted(requisitionId, actorUserId);

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.PURCHASE_ORDER_CREATED,
      entityType: 'PurchaseOrder',
      entityId: po.id,
      after: { poNumber, requisitionId, totalAmount },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.PURCHASE_ORDER_CREATED,
      companyId,
      { purchaseOrderId: po.id, requisitionId, totalAmount },
      'procurement',
    );
    return po;
  }

  async getById(id: string) {
    const po = await this.repo.findById(id);
    if (!po) throw new NotFoundException('Purchase order not found.');
    return po;
  }

  list(filters: {
    companyId: string;
    status?: PurchaseOrderStatus;
    supplierId?: string;
  }): Promise<PurchaseOrder[]> {
    return this.repo.list(filters);
  }

  /** Delegates approval resolution to the Rules Engine — never reimplemented here. */
  async requestApproval(
    purchaseOrderId: string,
    actorUserId: string,
    attributes: Record<string, unknown> = {},
  ): Promise<ApprovalRequest[]> {
    const po = await this.getById(purchaseOrderId);
    assertPurchaseOrderTransition(po.status, 'PENDING_APPROVAL');
    await this.repo.updateStatus(purchaseOrderId, 'PENDING_APPROVAL');

    const { approvers } = await this.approvalEvaluator.evaluateApproval(
      po.companyId,
      'procurement',
      {
        ...attributes,
        purchaseOrderId,
        poValue: Number(po.totalAmount),
        supplierId: po.supplierId,
      },
    );

    if (approvers.length === 0) {
      await this.repo.updateStatus(purchaseOrderId, 'APPROVED');
      return [];
    }

    return Promise.all(
      approvers.map((a) =>
        this.repo.createApproval({
          companyId: po.companyId,
          purchaseOrderId,
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
    const po = await this.getById(approval.entityId);

    const nextStatus = decision === 'APPROVED' ? 'APPROVED' : 'DRAFT';
    await this.repo.updateStatus(approval.entityId, nextStatus);
    await this.audit.record({
      companyId: po.companyId,
      actorUserId,
      eventType: AuditEventType.PURCHASE_ORDER_APPROVED,
      entityType: 'PurchaseOrder',
      entityId: approval.entityId,
      after: { decision },
      ipAddress: ipAddress ?? null,
    });
    if (decision === 'APPROVED') {
      await this.events.publish(
        EVENT_TYPES.PURCHASE_ORDER_APPROVED,
        po.companyId,
        { purchaseOrderId: approval.entityId },
        'procurement',
      );
    }
    return updated;
  }

  private async transition(
    id: string,
    to: PurchaseOrderStatus,
    eventType: AuditEventType,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PurchaseOrder> {
    const before = await this.getById(id);
    assertPurchaseOrderTransition(before.status, to);
    const updated = await this.repo.updateStatus(id, to);
    await this.audit.record({
      companyId: before.companyId,
      actorUserId,
      eventType,
      entityType: 'PurchaseOrder',
      entityId: id,
      before: { status: before.status },
      after: { status: to },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  send(id: string, actorUserId: string, ipAddress?: string | null): Promise<PurchaseOrder> {
    return this.transition(id, 'SENT', AuditEventType.PURCHASE_ORDER_SENT, actorUserId, ipAddress);
  }

  cancel(id: string, actorUserId: string, ipAddress?: string | null): Promise<PurchaseOrder> {
    return this.transition(
      id,
      'CANCELLED',
      AuditEventType.PURCHASE_ORDER_STATUS_CHANGED,
      actorUserId,
      ipAddress,
    );
  }

  close(id: string, actorUserId: string, ipAddress?: string | null): Promise<PurchaseOrder> {
    return this.transition(
      id,
      'CLOSED',
      AuditEventType.PURCHASE_ORDER_STATUS_CHANGED,
      actorUserId,
      ipAddress,
    );
  }

  /** Called once per PASSED goods-receipt line by GoodsReceiptService — same module, no port needed. */
  async recordLineReceipt(
    purchaseOrderId: string,
    lineItemId: string,
    quantity: number,
  ): Promise<void> {
    await this.repo.incrementLineReceivedQuantity(lineItemId, quantity);
    const lineItems = await this.repo.listLineItems(purchaseOrderId);
    const nextStatus = computeAggregateReceiptStatus(
      lineItems.map((l) => ({
        quantity: Number(l.quantity),
        receivedQuantity: Number(l.receivedQuantity),
      })),
    );
    const before = await this.getById(purchaseOrderId);
    if (nextStatus !== before.status) {
      if (before.status !== 'SENT' && before.status !== 'PARTIALLY_RECEIVED') {
        throw new BadRequestException(
          `Cannot receive against a purchase order that is ${before.status}.`,
        );
      }
      assertPurchaseOrderTransition(before.status, nextStatus);
      await this.repo.updateStatus(purchaseOrderId, nextStatus);
    }
  }
}
