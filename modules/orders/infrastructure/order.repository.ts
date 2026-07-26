import type {
  TenantScopedPrismaClient,
  TenantScopedTransactionClient,
  Order,
  OrderLineItem,
  OrderStatus,
  UnitOfMeasure,
  Incoterm,
  ApprovalRequest,
  ApprovalStatus,
} from '@platform/database';

type Client = TenantScopedPrismaClient | TenantScopedTransactionClient;

export interface OrderLineItemInput {
  productId: string;
  quantity: number;
  uom: UnitOfMeasure;
  unitPrice: number;
  lineTotal: number;
}

export interface CreateOrderInput {
  companyId: string;
  orderNumber: string;
  customerId: string;
  quotationId?: string;
  currency: string;
  incoterm?: Incoterm;
  createdByUserId: string;
  lineItems: OrderLineItemInput[];
  subtotal: number;
  totalAmount: number;
}

const ORDER_INCLUDE = { lineItems: true } as const;

export type OrderWithLineItems = Order & { lineItems: OrderLineItem[] };

export class OrderRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateOrderInput, client: Client = this.prisma): Promise<OrderWithLineItems> {
    return client.order.create({
      data: {
        companyId: input.companyId,
        orderNumber: input.orderNumber,
        customerId: input.customerId,
        quotationId: input.quotationId,
        currency: input.currency,
        incoterm: input.incoterm,
        createdByUserId: input.createdByUserId,
        status: 'PENDING_CONFIRMATION',
        subtotal: input.subtotal,
        totalAmount: input.totalAmount,
        lineItems: { create: input.lineItems },
      },
      include: ORDER_INCLUDE,
    });
  }

  findById(id: string): Promise<OrderWithLineItems | null> {
    return this.prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
  }

  list(filters: {
    companyId: string;
    status?: OrderStatus;
    customerId?: string;
  }): Promise<OrderWithLineItems[]> {
    return this.prisma.order.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        customerId: filters.customerId,
      },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: OrderStatus): Promise<Order> {
    return this.prisma.order.update({ where: { id }, data: { status } });
  }

  update(id: string, data: Partial<Pick<Order, 'incoterm' | 'currency'>>): Promise<Order> {
    return this.prisma.order.update({ where: { id }, data });
  }

  setLineFulfilledQuantity(lineItemId: string, fulfilledQuantity: number): Promise<OrderLineItem> {
    return this.prisma.orderLineItem.update({
      where: { id: lineItemId },
      data: { fulfilledQuantity },
    });
  }

  listLineItems(orderId: string): Promise<OrderLineItem[]> {
    return this.prisma.orderLineItem.findMany({ where: { orderId } });
  }

  createApproval(input: {
    companyId: string;
    orderId: string;
    ruleExecutionId?: string;
    approverUserId?: string;
    approverRoleId?: string;
  }): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.create({
      data: {
        companyId: input.companyId,
        entityType: 'order',
        entityId: input.orderId,
        ruleExecutionId: input.ruleExecutionId,
        approverUserId: input.approverUserId,
        approverRoleId: input.approverRoleId,
      },
    });
  }

  findApproval(id: string): Promise<ApprovalRequest | null> {
    return this.prisma.approvalRequest.findUnique({ where: { id } });
  }

  decideApproval(id: string, decision: ApprovalStatus, comment?: string): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.update({
      where: { id },
      data: { status: decision, decidedAt: new Date(), comment },
    });
  }
}
