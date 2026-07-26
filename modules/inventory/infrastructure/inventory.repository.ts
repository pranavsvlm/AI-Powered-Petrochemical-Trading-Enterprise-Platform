import type {
  TenantScopedPrismaClient,
  TenantScopedTransactionClient,
  Warehouse,
  WarehouseStatus,
  InventoryItem,
  InventoryBatch,
  InventoryMovement,
  InventoryMovementType,
  StockReservation,
  StockReservationStatus,
  StockAdjustment,
} from '@platform/database';

type Client = TenantScopedPrismaClient | TenantScopedTransactionClient;

export interface CreateWarehouseInput {
  companyId: string;
  branchId?: string;
  code: string;
  name: string;
  addressLine1?: string;
  city?: string;
  country?: string;
  isDefault?: boolean;
}

export interface CreateInventoryItemInput {
  companyId: string;
  productId: string;
  warehouseId: string;
  reorderPoint?: number;
}

export interface CreateReservationInput {
  companyId: string;
  orderId: string;
  orderLineItemId: string;
  inventoryItemId: string;
  quantity: number;
}

export interface CreateMovementInput {
  companyId: string;
  inventoryItemId: string;
  movementType: InventoryMovementType;
  quantity: number;
  entityType: string;
  entityId?: string;
  note?: string;
}

export interface CreateAdjustmentInput {
  companyId: string;
  inventoryItemId: string;
  quantityDelta: number;
  reason: string;
  actorUserId: string;
}

export class InventoryRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  createWarehouse(input: CreateWarehouseInput): Promise<Warehouse> {
    return this.prisma.warehouse.create({
      data: {
        companyId: input.companyId,
        branchId: input.branchId,
        code: input.code,
        name: input.name,
        addressLine1: input.addressLine1,
        city: input.city,
        country: input.country,
        isDefault: input.isDefault ?? false,
      },
    });
  }

  findWarehouseById(id: string): Promise<Warehouse | null> {
    return this.prisma.warehouse.findUnique({ where: { id } });
  }

  listWarehouses(companyId: string, status?: WarehouseStatus): Promise<Warehouse[]> {
    return this.prisma.warehouse.findMany({
      where: { companyId, status },
      orderBy: { createdAt: 'asc' },
    });
  }

  findDefaultWarehouse(companyId: string): Promise<Warehouse | null> {
    return this.prisma.warehouse.findFirst({ where: { companyId, isDefault: true } });
  }

  findInventoryItem(
    companyId: string,
    productId: string,
    warehouseId: string,
    client: Client = this.prisma,
  ): Promise<InventoryItem | null> {
    return client.inventoryItem.findUnique({
      where: { companyId_productId_warehouseId: { companyId, productId, warehouseId } },
    });
  }

  createInventoryItem(input: CreateInventoryItemInput): Promise<InventoryItem> {
    return this.prisma.inventoryItem.create({
      data: {
        companyId: input.companyId,
        productId: input.productId,
        warehouseId: input.warehouseId,
        reorderPoint: input.reorderPoint,
      },
    });
  }

  getInventoryItemById(id: string, client: Client = this.prisma): Promise<InventoryItem | null> {
    return client.inventoryItem.findUnique({ where: { id } });
  }

  listInventoryItems(companyId: string, warehouseId?: string): Promise<InventoryItem[]> {
    return this.prisma.inventoryItem.findMany({
      where: { companyId, warehouseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The race-safe reservation primitive: a conditional UPDATE whose WHERE clause re-checks
   * availability, relying on Postgres row-level UPDATE semantics to serialize concurrent
   * writers (the second blocks until the first commits, then re-evaluates against the
   * now-current value). Returns the number of rows affected — 0 means insufficient stock.
   *
   * Uses $executeRaw, which the tenant extension does NOT intercept (it only wraps model
   * delegate calls), so company_id is included in the WHERE clause by hand — a deliberate,
   * necessary bypass, not an oversight. See docs/DOMAIN_MODEL_PHASE5.md.
   */
  atomicReserve(
    client: TenantScopedTransactionClient,
    companyId: string,
    inventoryItemId: string,
    quantity: number,
  ): Promise<number> {
    return client.$executeRaw`
      UPDATE inventory_items
      SET quantity_reserved = quantity_reserved + ${quantity}, updated_at = now()
      WHERE id = ${inventoryItemId}
        AND company_id = ${companyId}
        AND (quantity_on_hand - quantity_reserved) >= ${quantity}
    `;
  }

  createReservation(client: Client, input: CreateReservationInput): Promise<StockReservation> {
    return client.stockReservation.create({
      data: {
        companyId: input.companyId,
        orderId: input.orderId,
        orderLineItemId: input.orderLineItemId,
        inventoryItemId: input.inventoryItemId,
        quantity: input.quantity,
      },
    });
  }

  findReservationByOrderLineItem(orderLineItemId: string): Promise<StockReservation | null> {
    return this.prisma.stockReservation.findUnique({ where: { orderLineItemId } });
  }

  listReservationsByOrder(companyId: string, orderId: string): Promise<StockReservation[]> {
    return this.prisma.stockReservation.findMany({ where: { companyId, orderId } });
  }

  updateReservationStatus(
    client: Client,
    id: string,
    status: StockReservationStatus,
  ): Promise<StockReservation> {
    return client.stockReservation.update({ where: { id }, data: { status } });
  }

  createMovement(client: Client, input: CreateMovementInput): Promise<InventoryMovement> {
    return client.inventoryMovement.create({
      data: {
        companyId: input.companyId,
        inventoryItemId: input.inventoryItemId,
        movementType: input.movementType,
        quantity: input.quantity,
        entityType: input.entityType,
        entityId: input.entityId,
        note: input.note,
      },
    });
  }

  listMovements(companyId: string, inventoryItemId?: string): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { companyId, inventoryItemId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Commit step: converts an ACTIVE reservation to permanent stock-out (on-hand and reserved both drop). */
  decrementOnHandAndReserved(
    client: Client,
    inventoryItemId: string,
    quantity: number,
  ): Promise<InventoryItem> {
    return client.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { quantityOnHand: { decrement: quantity }, quantityReserved: { decrement: quantity } },
    });
  }

  /** Compensating action: undoes a commit (both on-hand and reserved go back up). */
  incrementOnHandAndReserved(
    client: Client,
    inventoryItemId: string,
    quantity: number,
  ): Promise<InventoryItem> {
    return client.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { quantityOnHand: { increment: quantity }, quantityReserved: { increment: quantity } },
    });
  }

  /** Release step: an ACTIVE reservation is dropped without ever being committed. */
  decrementReserved(
    client: Client,
    inventoryItemId: string,
    quantity: number,
  ): Promise<InventoryItem> {
    return client.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { quantityReserved: { decrement: quantity } },
    });
  }

  createBatch(
    client: Client,
    input: { inventoryItemId: string; batchNumber: string; quantity: number; expiryDate?: Date },
  ): Promise<InventoryBatch> {
    return client.inventoryBatch.create({ data: input });
  }

  createAdjustment(client: Client, input: CreateAdjustmentInput): Promise<StockAdjustment> {
    return client.stockAdjustment.create({ data: input });
  }
}
