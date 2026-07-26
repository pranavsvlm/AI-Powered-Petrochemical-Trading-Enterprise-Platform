/**
 * Warehouse + stock lifecycle (doc 16) against real Postgres — see
 * docs/DOMAIN_MODEL_PHASE5.md. Exercises InventoryService directly (the same shape
 * apps/backend/src/modules/inventory/inventory.module.ts wires in production), not mocks.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { RedisStreamsEventBus } from '@platform/event-bus';
import { InventoryService, InsufficientStockException } from '@modules/inventory';

const db = getPrismaClient();
const rawDb = new PrismaClient();

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

function asCompany<T>(companyId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

function buildInventoryService() {
  const eventBus = new RedisStreamsEventBus();
  const auditEntries: Array<{ eventType: string; entityId: string | null }> = [];
  const audit = {
    record: async (entry: { eventType: string; entityId: string | null }) => {
      auditEntries.push(entry);
    },
  };
  return { inventoryService: new InventoryService(db, eventBus, audit), auditEntries };
}

describe('Inventory: warehouse + stock lifecycle (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  let productId: string;
  let inventoryService: InventoryService;
  let auditEntries: Array<{ eventType: string; entityId: string | null }>;
  let warehouseId: string;

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-INV-${Date.now()}`,
          legalName: 'Inventory Lifecycle Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    const user = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'Inv',
          lastName: 'Tester',
          email: `inv-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;

    const product = await withoutTenant(() =>
      rawDb.product.create({
        data: {
          companyId,
          sku: `SKU-INV-${Date.now()}`,
          name: 'Base Oil 150N',
          baseUom: 'MT',
          status: 'ACTIVE',
        },
      }),
    );
    productId = product.id;

    ({ inventoryService, auditEntries } = buildInventoryService());
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.stockAdjustment.deleteMany({ where: { companyId } });
      await rawDb.stockReservation.deleteMany({ where: { companyId } });
      await rawDb.inventoryMovement.deleteMany({ where: { companyId } });
      await rawDb.inventoryBatch.deleteMany({
        where: { inventoryItem: { companyId } },
      });
      await rawDb.inventoryItem.deleteMany({ where: { companyId } });
      await rawDb.warehouse.deleteMany({ where: { companyId } });
      await rawDb.product.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
    await db.$disconnect();
  });

  it('creates a default warehouse', async () => {
    const warehouse = await asCompany(companyId, userId, () =>
      inventoryService.createWarehouse(
        companyId,
        { code: 'WH-1', name: 'Main Warehouse', isDefault: true },
        userId,
      ),
    );
    warehouseId = warehouse.id;
    expect(warehouse.isDefault).toBe(true);
    expect(auditEntries.some((e) => e.eventType === 'WAREHOUSE_CREATED')).toBe(true);

    const resolvedDefault = await asCompany(companyId, userId, () =>
      inventoryService.getDefaultWarehouseId(companyId),
    );
    expect(resolvedDefault).toBe(warehouseId);
  });

  it('records a receipt, increasing quantityOnHand and logging a RECEIPT movement', async () => {
    await asCompany(companyId, userId, () =>
      inventoryService.recordReceipt({
        companyId,
        productId,
        warehouseId,
        quantity: 100,
        batchNumber: 'BATCH-001',
        entityType: 'Test',
        entityId: 'seed-1',
      }),
    );

    const item = await asCompany(companyId, userId, () =>
      inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );
    expect(Number(item.quantityOnHand)).toBe(100);
    expect(Number(item.quantityReserved)).toBe(0);

    const movements = await asCompany(companyId, userId, () =>
      inventoryService.listMovements(companyId, item.id),
    );
    expect(movements.some((m) => m.movementType === 'RECEIPT' && Number(m.quantity) === 100)).toBe(
      true,
    );
  });

  it('rejects reserving more than is available', async () => {
    await expect(
      asCompany(companyId, userId, () =>
        db.$transaction((tx) =>
          inventoryService.reserve(
            tx,
            companyId,
            'fake-order-1',
            [{ orderLineItemId: 'fake-line-1', productId, quantity: 1000 }],
            warehouseId,
          ),
        ),
      ),
    ).rejects.toThrow(InsufficientStockException);
  });

  it('adjusts stock and logs an ADJUSTMENT movement', async () => {
    const item = await asCompany(companyId, userId, () =>
      inventoryService.getOrCreateInventoryItem(companyId, productId, warehouseId),
    );

    const adjusted = await asCompany(companyId, userId, () =>
      inventoryService.adjustStock(companyId, item.id, -5, 'Damaged in transit', userId),
    );
    expect(Number(adjusted.quantityOnHand)).toBe(95);

    const movements = await asCompany(companyId, userId, () =>
      inventoryService.listMovements(companyId, item.id),
    );
    expect(
      movements.some((m) => m.movementType === 'ADJUSTMENT' && Number(m.quantity) === -5),
    ).toBe(true);
  });
});

describe('Inventory tenant isolation', () => {
  let companyAId: string;
  let companyBId: string;
  let userAId: string;
  let userBId: string;
  let productAId: string;
  let servicesA: ReturnType<typeof buildInventoryService>;
  let servicesB: ReturnType<typeof buildInventoryService>;

  beforeAll(async () => {
    const companyA = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-INV-A-${Date.now()}`,
          legalName: 'Inventory Tenant A',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    const companyB = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-INV-B-${Date.now()}`,
          legalName: 'Inventory Tenant B',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyAId = companyA.id;
    companyBId = companyB.id;

    const userA = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId: companyAId,
          firstName: 'A',
          lastName: 'User',
          email: `inv-a-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    const userB = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId: companyBId,
          firstName: 'B',
          lastName: 'User',
          email: `inv-b-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userAId = userA.id;
    userBId = userB.id;

    const productA = await withoutTenant(() =>
      rawDb.product.create({
        data: { companyId: companyAId, sku: 'A-SKU-INV', name: 'Tenant A Product', baseUom: 'MT' },
      }),
    );
    productAId = productA.id;

    servicesA = buildInventoryService();
    servicesB = buildInventoryService();
  });

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.inventoryItem.deleteMany({
        where: { companyId: { in: [companyAId, companyBId] } },
      });
      await rawDb.warehouse.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.product.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.user.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
      await rawDb.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
    });
  });

  it("Company B cannot see Company A's warehouse", async () => {
    const warehouseA = await asCompany(companyAId, userAId, () =>
      servicesA.inventoryService.createWarehouse(
        companyAId,
        { code: 'WH-A', name: 'A Warehouse' },
        userAId,
      ),
    );

    const listB = await asCompany(companyBId, userBId, () =>
      servicesB.inventoryService.listWarehouses(companyBId),
    );
    expect(listB.some((w) => w.id === warehouseA.id)).toBe(false);

    await expect(
      asCompany(companyBId, userBId, () =>
        servicesB.inventoryService.getWarehouseById(warehouseA.id),
      ),
    ).rejects.toThrow();
  });

  it("Company B's reservation attempt against Company A's inventory item fails closed", async () => {
    const warehouseA = await asCompany(companyAId, userAId, () =>
      servicesA.inventoryService.createWarehouse(
        companyAId,
        { code: 'WH-A-2', name: 'A Warehouse 2', isDefault: true },
        userAId,
      ),
    );
    await asCompany(companyAId, userAId, () =>
      servicesA.inventoryService.recordReceipt({
        companyId: companyAId,
        productId: productAId,
        warehouseId: warehouseA.id,
        quantity: 50,
        entityType: 'Test',
        entityId: 'seed-a',
      }),
    );

    // Company B, scoped to its own tenant context, cannot find an inventory item that belongs
    // to Company A — the tenant extension's company_id predicate makes it invisible, not just
    // unauthorized. reserve() treats "not found" the same as "insufficient stock."
    await expect(
      asCompany(companyBId, userBId, () =>
        db.$transaction((tx) =>
          servicesB.inventoryService.reserve(
            tx,
            companyBId,
            'fake-order-cross',
            [{ orderLineItemId: 'fake-line-cross', productId: productAId, quantity: 1 }],
            warehouseA.id,
          ),
        ),
      ),
    ).rejects.toThrow();
  });
}, 30000);
