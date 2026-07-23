import type {
  TenantScopedPrismaClient,
  Quotation,
  QuotationVersion,
  QuotationLineItem,
  QuotationStatus,
  UnitOfMeasure,
  ApprovalRequest,
  ApprovalStatus,
} from '@platform/database';

export interface QuotationLineItemInput {
  productId: string;
  quantity: number;
  uom: UnitOfMeasure;
  unitPrice: number;
  discountPercent?: number;
  lineTotal: number;
}

export interface QuotationTotalsInput {
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  marginPercent?: number | null;
}

export interface CreateQuotationInput {
  companyId: string;
  quotationNumber: string;
  rfqId?: string;
  customerId: string;
  currency: string;
  validUntil?: Date;
  createdByUserId: string;
  lineItems: QuotationLineItemInput[];
  totals: QuotationTotalsInput;
}

const QUOTATION_INCLUDE = {
  versions: { include: { lineItems: true }, orderBy: { versionNumber: 'desc' as const } },
} as const;

export type QuotationVersionWithLineItems = QuotationVersion & { lineItems: QuotationLineItem[] };
export type QuotationWithVersions = Quotation & { versions: QuotationVersionWithLineItems[] };

export class QuotationRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateQuotationInput): Promise<QuotationWithVersions> {
    return this.prisma.quotation.create({
      data: {
        companyId: input.companyId,
        quotationNumber: input.quotationNumber,
        rfqId: input.rfqId,
        customerId: input.customerId,
        currency: input.currency,
        validUntil: input.validUntil,
        createdByUserId: input.createdByUserId,
        status: 'DRAFT',
        currentVersionNumber: 1,
        subtotal: input.totals.subtotal,
        discountAmount: input.totals.discountAmount,
        totalAmount: input.totals.totalAmount,
        marginPercent: input.totals.marginPercent ?? null,
        versions: {
          create: {
            versionNumber: 1,
            subtotal: input.totals.subtotal,
            discountAmount: input.totals.discountAmount,
            totalAmount: input.totals.totalAmount,
            marginPercent: input.totals.marginPercent ?? null,
            createdByUserId: input.createdByUserId,
            lineItems: { create: input.lineItems },
          },
        },
      },
      include: QUOTATION_INCLUDE,
    });
  }

  findById(id: string): Promise<QuotationWithVersions | null> {
    return this.prisma.quotation.findUnique({ where: { id }, include: QUOTATION_INCLUDE });
  }

  list(filters: {
    companyId: string;
    status?: QuotationStatus;
    customerId?: string;
  }): Promise<QuotationWithVersions[]> {
    return this.prisma.quotation.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        customerId: filters.customerId,
      },
      include: QUOTATION_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: QuotationStatus): Promise<Quotation> {
    return this.prisma.quotation.update({ where: { id }, data: { status } });
  }

  async addVersion(
    quotationId: string,
    versionNumber: number,
    totals: QuotationTotalsInput,
    lineItems: QuotationLineItemInput[],
    createdByUserId: string,
  ): Promise<QuotationVersionWithLineItems> {
    const version = await this.prisma.quotationVersion.create({
      data: {
        quotationId,
        versionNumber,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        marginPercent: totals.marginPercent ?? null,
        createdByUserId,
        lineItems: { create: lineItems },
      },
      include: { lineItems: true },
    });
    await this.prisma.quotation.update({
      where: { id: quotationId },
      data: {
        currentVersionNumber: versionNumber,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        marginPercent: totals.marginPercent ?? null,
      },
    });
    return version;
  }

  createApproval(input: {
    companyId: string;
    quotationId: string;
    ruleExecutionId?: string;
    approverUserId?: string;
    approverRoleId?: string;
  }): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.create({
      data: {
        companyId: input.companyId,
        entityType: 'quotation',
        entityId: input.quotationId,
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
