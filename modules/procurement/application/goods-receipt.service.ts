import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type { TenantScopedPrismaClient, GoodsReceipt, InspectionResult } from '@platform/database';
import {
  GoodsReceiptRepository,
  type GoodsReceiptLineItemInput,
} from '../infrastructure/procurement.repository';
import { PurchaseOrderService } from './purchase-order.service';

export interface GoodsReceiptAuditWriter {
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

export interface GoodsReceiptEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/** Published by @modules/inventory, satisfied by InventoryService.getWarehouseById. */
export interface WarehouseLookupPort {
  getWarehouseById(id: string): Promise<{ id: string }>;
}

/** Published by @modules/inventory, satisfied by InventoryService.recordReceipt. Only PASSED lines call this. */
export interface InventoryReceiptPort {
  recordReceipt(input: {
    companyId: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    batchNumber?: string;
    expiryDate?: Date;
    entityType: string;
    entityId: string;
  }): Promise<void>;
}

export interface CreateGoodsReceiptLineInput {
  purchaseOrderItemId: string;
  quantityReceived: number;
  inspectionResult?: InspectionResult;
  batchNumber?: string;
  expiryDate?: Date;
}

export interface CreateGoodsReceiptDirectInput {
  receiptNumber: string;
  purchaseOrderId: string;
  warehouseId: string;
  lineItems: CreateGoodsReceiptLineInput[];
}

/**
 * Application-layer use case for the GoodsReceipt aggregate (doc 17): receiving PO lines into
 * a warehouse. Only PASSED inspection lines feed InventoryBatch/InventoryMovement(RECEIPT)/
 * InventoryItem.quantityOnHand — see docs/DOMAIN_MODEL_PHASE5.md. Depends directly on
 * PurchaseOrderService (same module, no port needed) and on Inventory's published ports
 * (cross-module).
 */
@Injectable()
export class GoodsReceiptService {
  private readonly logger = new Logger(GoodsReceiptService.name);
  private readonly repo: GoodsReceiptRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly events: GoodsReceiptEventPublisher,
    private readonly audit: GoodsReceiptAuditWriter,
    private readonly warehouses: WarehouseLookupPort,
    private readonly inventory: InventoryReceiptPort,
    private readonly purchaseOrders: PurchaseOrderService,
  ) {
    this.repo = new GoodsReceiptRepository(db);
  }

  async create(
    companyId: string,
    input: CreateGoodsReceiptDirectInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<GoodsReceipt> {
    await this.warehouses.getWarehouseById(input.warehouseId);
    const po = await this.purchaseOrders.getById(input.purchaseOrderId);
    if (po.status !== 'SENT' && po.status !== 'PARTIALLY_RECEIVED') {
      throw new BadRequestException(
        `Cannot receive against a purchase order that is ${po.status}.`,
      );
    }

    const lineItems: GoodsReceiptLineItemInput[] = input.lineItems.map((li) => ({
      purchaseOrderItemId: li.purchaseOrderItemId,
      quantityReceived: li.quantityReceived,
      inspectionResult: li.inspectionResult ?? 'PASSED',
      batchNumber: li.batchNumber,
      expiryDate: li.expiryDate,
    }));

    const receipt = await this.repo.create({
      companyId,
      receiptNumber: input.receiptNumber,
      purchaseOrderId: input.purchaseOrderId,
      warehouseId: input.warehouseId,
      receivedByUserId: actorUserId,
      lineItems,
    });

    for (const line of receipt.lineItems) {
      const poLine = po.lineItems.find((l) => l.id === line.purchaseOrderItemId);
      if (!poLine) {
        throw new BadRequestException(
          `Purchase order item ${line.purchaseOrderItemId} does not belong to purchase order ${input.purchaseOrderId}.`,
        );
      }
      if (line.inspectionResult === 'PASSED') {
        await this.inventory.recordReceipt({
          companyId,
          productId: poLine.productId,
          warehouseId: input.warehouseId,
          quantity: Number(line.quantityReceived),
          batchNumber: line.batchNumber ?? undefined,
          expiryDate: line.expiryDate ?? undefined,
          entityType: 'GoodsReceipt',
          entityId: receipt.id,
        });
        await this.purchaseOrders.recordLineReceipt(
          input.purchaseOrderId,
          line.purchaseOrderItemId,
          Number(line.quantityReceived),
        );
      }
    }

    const completed = await this.repo.updateStatus(receipt.id, 'COMPLETED');
    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.GOODS_RECEIPT_RECORDED,
      entityType: 'GoodsReceipt',
      entityId: receipt.id,
      after: { receiptNumber: input.receiptNumber, purchaseOrderId: input.purchaseOrderId },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.GOODS_RECEIVED,
      companyId,
      { goodsReceiptId: receipt.id, purchaseOrderId: input.purchaseOrderId },
      'procurement',
    );
    return { ...receipt, status: completed.status };
  }

  async getById(id: string): Promise<GoodsReceipt> {
    const receipt = await this.repo.findById(id);
    if (!receipt) throw new NotFoundException('Goods receipt not found.');
    return receipt;
  }

  list(filters: { companyId: string; purchaseOrderId?: string }): Promise<GoodsReceipt[]> {
    return this.repo.list(filters);
  }
}
