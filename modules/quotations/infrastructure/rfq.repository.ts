import type {
  TenantScopedPrismaClient,
  Rfq,
  RfqLineItem,
  RfqStatus,
  UnitOfMeasure,
} from '@platform/database';

export interface CreateRfqInput {
  companyId: string;
  rfqNumber: string;
  customerId: string;
  currency: string;
  notes?: string;
  createdByUserId: string;
  lineItems: Array<{
    productId: string;
    quantity: number;
    uom: UnitOfMeasure;
    targetPrice?: number;
  }>;
}

const RFQ_INCLUDE = { lineItems: true } as const;

export type RfqWithLineItems = Rfq & { lineItems: RfqLineItem[] };

export class RfqRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateRfqInput): Promise<RfqWithLineItems> {
    return this.prisma.rfq.create({
      data: {
        companyId: input.companyId,
        rfqNumber: input.rfqNumber,
        customerId: input.customerId,
        currency: input.currency,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
        status: 'DRAFT',
        lineItems: { create: input.lineItems },
      },
      include: RFQ_INCLUDE,
    });
  }

  findById(id: string): Promise<RfqWithLineItems | null> {
    return this.prisma.rfq.findUnique({ where: { id }, include: RFQ_INCLUDE });
  }

  list(filters: {
    companyId: string;
    status?: RfqStatus;
    customerId?: string;
  }): Promise<RfqWithLineItems[]> {
    return this.prisma.rfq.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        customerId: filters.customerId,
      },
      include: RFQ_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: RfqStatus): Promise<Rfq> {
    return this.prisma.rfq.update({ where: { id }, data: { status } });
  }

  addLineItem(
    rfqId: string,
    input: { productId: string; quantity: number; uom: UnitOfMeasure; targetPrice?: number },
  ): Promise<RfqLineItem> {
    return this.prisma.rfqLineItem.create({ data: { rfqId, ...input } });
  }

  removeLineItem(lineItemId: string): Promise<RfqLineItem> {
    return this.prisma.rfqLineItem.delete({ where: { id: lineItemId } });
  }
}
