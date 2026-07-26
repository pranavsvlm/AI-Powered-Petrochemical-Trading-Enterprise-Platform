import { OrderService } from './order.service';

const COMPANY_ID = 'company-1';
const ORDER_ID = 'order-1';

function createFakeDb(initialStatus: string) {
  const state = {
    id: ORDER_ID,
    companyId: COMPANY_ID,
    orderNumber: 'ORD-0001',
    customerId: 'customer-1',
    currency: 'USD',
    subtotal: 100,
    totalAmount: 100,
    status: initialStatus,
    incoterm: null,
    quotationId: null,
    createdByUserId: 'user-1',
    lineItems: [
      {
        id: 'line-1',
        orderId: ORDER_ID,
        productId: 'product-1',
        quantity: 10,
        uom: 'MT',
        unitPrice: 10,
        lineTotal: 100,
        fulfilledQuantity: 0,
        warehouseId: null,
      },
    ],
  };

  const order = {
    findUnique: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...state, lineItems: state.lineItems })),
    update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      Object.assign(state, data);
      return Promise.resolve({ ...state });
    }),
  };

  return { state, db: { order } as never };
}

function buildService(
  db: never,
  overrides: {
    inventoryCommit?: { commit: jest.Mock; reverseCommit: jest.Mock };
    invoicing?: { generateInvoiceForOrder: jest.Mock };
  } = {},
) {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const events = { publish: jest.fn().mockResolvedValue({ eventId: 'evt-1' }) };
  const approvalEvaluator = {
    evaluateApproval: jest.fn().mockResolvedValue({ approvers: [], matchedRuleIds: [] }),
  };
  const quotations = {
    getForOrderCreation: jest.fn(),
    markConverted: jest.fn(),
  };
  const customers = { getById: jest.fn().mockResolvedValue({ id: 'customer-1' }) };
  const products = { getById: jest.fn().mockResolvedValue({ id: 'product-1' }) };
  const inventoryReserve = { reserve: jest.fn().mockResolvedValue(undefined) };
  const inventoryRelease = { release: jest.fn().mockResolvedValue(undefined) };
  const inventoryCommit = overrides.inventoryCommit ?? {
    commit: jest.fn().mockResolvedValue(undefined),
    reverseCommit: jest.fn().mockResolvedValue(undefined),
  };
  const invoicing = overrides.invoicing ?? {
    generateInvoiceForOrder: jest.fn().mockResolvedValue(undefined),
  };

  const service = new OrderService(
    db,
    approvalEvaluator,
    events,
    audit,
    quotations,
    customers,
    products,
    inventoryReserve,
    inventoryRelease,
    inventoryCommit,
    invoicing,
  );

  return { service, audit, events, inventoryCommit, invoicing, inventoryRelease };
}

describe('OrderService confirmation saga', () => {
  it('commits inventory and generates an invoice on the happy path', async () => {
    const { db } = createFakeDb('PENDING_CONFIRMATION');
    const { service, inventoryCommit, invoicing } = buildService(db);

    await service.confirm(ORDER_ID, 'actor-1', null);

    expect(inventoryCommit.commit).toHaveBeenCalledWith(COMPANY_ID, ORDER_ID);
    expect(invoicing.generateInvoiceForOrder).toHaveBeenCalledTimes(1);
    expect(inventoryCommit.reverseCommit).not.toHaveBeenCalled();
  });

  it('compensates by reversing the inventory commit when invoice generation fails, and re-throws', async () => {
    const { db, state } = createFakeDb('PENDING_CONFIRMATION');
    const failure = new Error('invoice generation failed');
    const inventoryCommit = {
      commit: jest.fn().mockResolvedValue(undefined),
      reverseCommit: jest.fn().mockResolvedValue(undefined),
    };
    const invoicing = { generateInvoiceForOrder: jest.fn().mockRejectedValue(failure) };
    const { service } = buildService(db, { inventoryCommit, invoicing });

    await expect(service.confirm(ORDER_ID, 'actor-1', null)).rejects.toThrow(
      'invoice generation failed',
    );

    expect(inventoryCommit.commit).toHaveBeenCalledWith(COMPANY_ID, ORDER_ID);
    expect(inventoryCommit.reverseCommit).toHaveBeenCalledWith(COMPANY_ID, ORDER_ID);
    expect(inventoryCommit.reverseCommit).toHaveBeenCalledTimes(1);
    // Order.status is never rolled back even though the saga's later step failed — CONFIRMED +
    // reverted-inventory + no-invoice is a detectable, reconcilable state, not silently undone.
    expect(state.status).toBe('CONFIRMED');
  });

  it('also runs the saga when an order is approved via decideApproval', async () => {
    const { db } = createFakeDb('PENDING_CONFIRMATION');
    const { service, inventoryCommit, invoicing } = buildService(db);
    (db as { approvalRequest: unknown }).approvalRequest = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'approval-1',
        entityId: ORDER_ID,
        entityType: 'order',
        status: 'PENDING',
      }),
      update: jest.fn().mockResolvedValue({
        id: 'approval-1',
        entityId: ORDER_ID,
        entityType: 'order',
        status: 'APPROVED',
      }),
    };

    await service.decideApproval('approval-1', 'APPROVED', 'actor-1');

    expect(inventoryCommit.commit).toHaveBeenCalledWith(COMPANY_ID, ORDER_ID);
    expect(invoicing.generateInvoiceForOrder).toHaveBeenCalledTimes(1);
  });
});

describe('OrderService.cancel', () => {
  it('releases still-active reservations when cancelling a PENDING_CONFIRMATION order', async () => {
    const { db } = createFakeDb('PENDING_CONFIRMATION');
    const { service, inventoryRelease } = buildService(db);

    await service.cancel(ORDER_ID, 'actor-1', null);

    expect(inventoryRelease.release).toHaveBeenCalledWith(COMPANY_ID, ORDER_ID);
  });

  it('does not attempt to release reservations for an already-CONFIRMED order', async () => {
    const { db } = createFakeDb('CONFIRMED');
    const { service, inventoryRelease } = buildService(db);

    await service.cancel(ORDER_ID, 'actor-1', null);

    expect(inventoryRelease.release).not.toHaveBeenCalled();
  });
});
