import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type {
  TenantScopedPrismaClient,
  TenantScopedTransactionClient,
  Warehouse,
  WarehouseStatus,
  InventoryItem,
  InventoryMovement,
} from '@platform/database';
import { assertReservationTransition } from '../domain/reservation-lifecycle';
import { InventoryRepository } from '../infrastructure/inventory.repository';
import { InsufficientStockException } from './insufficient-stock.exception';

export interface InventoryAuditWriter {
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

export interface InventoryEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/** Published to @modules/orders — satisfied by ProductService.getById elsewhere, not here. */
export interface WarehouseLookupPort {
  getDefaultWarehouseId(companyId: string): Promise<string>;
  getWarehouseById(id: string): Promise<{ id: string }>;
}

export interface ReserveLineInput {
  orderLineItemId: string;
  productId: string;
  quantity: number;
}

/**
 * Published to @modules/orders, consumed inside OrderService.createDirect/createFromQuotation's
 * shared `db.$transaction(...)` — the reservation writes participate in the same atomic unit as
 * the order-creation write. See docs/DOMAIN_MODEL_PHASE5.md.
 */
export interface InventoryReservePort {
  reserve(
    tx: TenantScopedTransactionClient,
    companyId: string,
    orderId: string,
    lines: ReserveLineInput[],
    warehouseId?: string,
  ): Promise<void>;
}

/** Released only from the PENDING_CONFIRMATION -> CANCELLED transition — see OrderService.cancel(). */
export interface InventoryReleasePort {
  release(companyId: string, orderId: string): Promise<void>;
}

/** The confirmation saga's step 2/compensation — see OrderService's shared confirmation saga. */
export interface InventoryCommitPort {
  commit(companyId: string, orderId: string): Promise<void>;
  reverseCommit(companyId: string, orderId: string): Promise<void>;
}

export interface RecordReceiptInput {
  companyId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  batchNumber?: string;
  expiryDate?: Date;
  entityType: string;
  entityId: string;
}

/** Published to @modules/procurement — satisfied by GoodsReceiptService's PASSED-line loop. */
export interface InventoryReceiptPort {
  recordReceipt(input: RecordReceiptInput): Promise<void>;
}

/**
 * Application-layer use cases for the Inventory aggregate (doc 16): warehouses, stock levels,
 * the race-safe reservation primitive, and the movement ledger. See
 * docs/DOMAIN_MODEL_PHASE5.md for the full ratified design.
 */
@Injectable()
export class InventoryService
  implements
    WarehouseLookupPort,
    InventoryReservePort,
    InventoryReleasePort,
    InventoryCommitPort,
    InventoryReceiptPort
{
  private readonly logger = new Logger(InventoryService.name);
  private readonly repo: InventoryRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly events: InventoryEventPublisher,
    private readonly audit: InventoryAuditWriter,
  ) {
    this.repo = new InventoryRepository(db);
  }

  async createWarehouse(
    companyId: string,
    input: {
      code: string;
      name: string;
      branchId?: string;
      addressLine1?: string;
      city?: string;
      country?: string;
      isDefault?: boolean;
    },
    actorUserId: string,
  ): Promise<Warehouse> {
    const warehouse = await this.repo.createWarehouse({ companyId, ...input });
    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.WAREHOUSE_CREATED,
      entityType: 'Warehouse',
      entityId: warehouse.id,
      after: { code: input.code, name: input.name },
    });
    return warehouse;
  }

  listWarehouses(companyId: string, status?: WarehouseStatus): Promise<Warehouse[]> {
    return this.repo.listWarehouses(companyId, status);
  }

  async getWarehouseById(id: string): Promise<Warehouse> {
    const warehouse = await this.repo.findWarehouseById(id);
    if (!warehouse) throw new NotFoundException('Warehouse not found.');
    return warehouse;
  }

  async getDefaultWarehouseId(companyId: string): Promise<string> {
    const warehouse = await this.repo.findDefaultWarehouse(companyId);
    if (!warehouse) {
      throw new BadRequestException(
        'No default warehouse configured for this company. Create a warehouse with isDefault=true first.',
      );
    }
    return warehouse.id;
  }

  async getOrCreateInventoryItem(
    companyId: string,
    productId: string,
    warehouseId: string,
  ): Promise<InventoryItem> {
    const existing = await this.repo.findInventoryItem(companyId, productId, warehouseId);
    if (existing) return existing;
    return this.repo.createInventoryItem({ companyId, productId, warehouseId });
  }

  async getInventoryItem(id: string): Promise<InventoryItem> {
    const item = await this.repo.getInventoryItemById(id);
    if (!item) throw new NotFoundException('Inventory item not found.');
    return item;
  }

  listInventoryItems(companyId: string, warehouseId?: string): Promise<InventoryItem[]> {
    return this.repo.listInventoryItems(companyId, warehouseId);
  }

  listMovements(companyId: string, inventoryItemId?: string): Promise<InventoryMovement[]> {
    return this.repo.listMovements(companyId, inventoryItemId);
  }

  /**
   * The race-safe path: resolves each line's InventoryItem in the given warehouse (the
   * company's default when omitted), then atomically reserves it. Throws
   * InsufficientStockException — and, since it runs inside the caller's `tx`, rolls back the
   * order-creation write too — the moment any single line cannot be satisfied.
   */
  async reserve(
    tx: TenantScopedTransactionClient,
    companyId: string,
    orderId: string,
    lines: ReserveLineInput[],
    warehouseId?: string,
  ): Promise<void> {
    const resolvedWarehouseId = warehouseId ?? (await this.getDefaultWarehouseId(companyId));

    for (const line of lines) {
      const item = await this.repo.findInventoryItem(
        companyId,
        line.productId,
        resolvedWarehouseId,
        tx,
      );
      if (!item) throw new InsufficientStockException(line.productId);

      const affectedRows = await this.repo.atomicReserve(tx, companyId, item.id, line.quantity);
      if (affectedRows === 0) throw new InsufficientStockException(line.productId);

      await this.repo.createReservation(tx, {
        companyId,
        orderId,
        orderLineItemId: line.orderLineItemId,
        inventoryItemId: item.id,
        quantity: line.quantity,
      });
    }

    await this.events.publish(
      EVENT_TYPES.INVENTORY_RESERVED,
      companyId,
      { orderId, warehouseId: resolvedWarehouseId },
      'inventory',
    );
  }

  /** Releases still-ACTIVE reservations for an order back to available stock — see OrderService.cancel(). */
  async release(companyId: string, orderId: string): Promise<void> {
    const reservations = await this.repo.listReservationsByOrder(companyId, orderId);
    const active = reservations.filter((r) => r.status === 'ACTIVE');
    if (active.length === 0) return;

    await this.db.$transaction(async (tx) => {
      for (const reservation of active) {
        assertReservationTransition('ACTIVE', 'RELEASED');
        await this.repo.decrementReserved(
          tx,
          reservation.inventoryItemId,
          Number(reservation.quantity),
        );
        await this.repo.updateReservationStatus(tx, reservation.id, 'RELEASED');
        await this.repo.createMovement(tx, {
          companyId,
          inventoryItemId: reservation.inventoryItemId,
          movementType: 'RESERVATION_RELEASE',
          quantity: Number(reservation.quantity),
          entityType: 'Order',
          entityId: orderId,
        });
      }
    });
  }

  /** Saga step 2: converts an order's ACTIVE reservations to COMMITTED, dispatching stock for real. */
  async commit(companyId: string, orderId: string): Promise<void> {
    const reservations = await this.repo.listReservationsByOrder(companyId, orderId);
    const active = reservations.filter((r) => r.status === 'ACTIVE');
    if (active.length === 0) return;

    await this.db.$transaction(async (tx) => {
      for (const reservation of active) {
        assertReservationTransition('ACTIVE', 'COMMITTED');
        await this.repo.decrementOnHandAndReserved(
          tx,
          reservation.inventoryItemId,
          Number(reservation.quantity),
        );
        await this.repo.updateReservationStatus(tx, reservation.id, 'COMMITTED');
        await this.repo.createMovement(tx, {
          companyId,
          inventoryItemId: reservation.inventoryItemId,
          movementType: 'DISPATCH',
          quantity: -Number(reservation.quantity),
          entityType: 'Order',
          entityId: orderId,
        });
      }
    });

    await this.events.publish(EVENT_TYPES.INVENTORY_COMMITTED, companyId, { orderId }, 'inventory');
  }

  /** The saga's compensating action: undoes commit() when invoice generation subsequently fails. */
  async reverseCommit(companyId: string, orderId: string): Promise<void> {
    const reservations = await this.repo.listReservationsByOrder(companyId, orderId);
    const committed = reservations.filter((r) => r.status === 'COMMITTED');
    if (committed.length === 0) return;

    await this.db.$transaction(async (tx) => {
      for (const reservation of committed) {
        await this.repo.incrementOnHandAndReserved(
          tx,
          reservation.inventoryItemId,
          Number(reservation.quantity),
        );
        await this.repo.updateReservationStatus(tx, reservation.id, 'ACTIVE');
        await this.repo.createMovement(tx, {
          companyId,
          inventoryItemId: reservation.inventoryItemId,
          movementType: 'REVERSAL',
          quantity: Number(reservation.quantity),
          entityType: 'Order',
          entityId: orderId,
          note: 'Compensating reversal: invoice generation failed after inventory commit.',
        });
      }
    });
  }

  /** Consumed by GoodsReceiptService, once per PASSED goods-receipt line. */
  async recordReceipt(input: RecordReceiptInput): Promise<void> {
    const item = await this.getOrCreateInventoryItem(
      input.companyId,
      input.productId,
      input.warehouseId,
    );

    await this.db.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantityOnHand: { increment: input.quantity } },
      });
      if (input.batchNumber) {
        await this.repo.createBatch(tx, {
          inventoryItemId: item.id,
          batchNumber: input.batchNumber,
          quantity: input.quantity,
          expiryDate: input.expiryDate,
        });
      }
      await this.repo.createMovement(tx, {
        companyId: input.companyId,
        inventoryItemId: item.id,
        movementType: 'RECEIPT',
        quantity: input.quantity,
        entityType: input.entityType,
        entityId: input.entityId,
      });
    });

    await this.events.publish(
      EVENT_TYPES.GOODS_RECEIVED,
      input.companyId,
      { inventoryItemId: item.id, quantity: input.quantity },
      'inventory',
    );
  }

  async adjustStock(
    companyId: string,
    inventoryItemId: string,
    quantityDelta: number,
    reason: string,
    actorUserId: string,
  ): Promise<InventoryItem> {
    const item = await this.getInventoryItem(inventoryItemId);
    if (item.companyId !== companyId) throw new NotFoundException('Inventory item not found.');

    const updated = await this.db.$transaction(async (tx) => {
      const result = await tx.inventoryItem.update({
        where: { id: inventoryItemId },
        data: { quantityOnHand: { increment: quantityDelta } },
      });
      await this.repo.createAdjustment(tx, {
        companyId,
        inventoryItemId,
        quantityDelta,
        reason,
        actorUserId,
      });
      await this.repo.createMovement(tx, {
        companyId,
        inventoryItemId,
        movementType: 'ADJUSTMENT',
        quantity: quantityDelta,
        entityType: 'StockAdjustment',
      });
      return result;
    });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.STOCK_ADJUSTED,
      entityType: 'InventoryItem',
      entityId: inventoryItemId,
      before: { quantityOnHand: Number(item.quantityOnHand) },
      after: { quantityOnHand: Number(updated.quantityOnHand), quantityDelta, reason },
    });
    return updated;
  }
}
