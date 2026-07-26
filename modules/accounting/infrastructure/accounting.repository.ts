import type {
  TenantScopedPrismaClient,
  TenantScopedTransactionClient,
  ChartOfAccount,
  AccountType,
  Journal,
  JournalLine,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Payment,
  SupplierBill,
  SupplierBillStatus,
} from '@platform/database';

type Client = TenantScopedPrismaClient | TenantScopedTransactionClient;

export interface CreateChartOfAccountInput {
  companyId: string;
  accountCode: string;
  name: string;
  accountType: AccountType;
}

export class ChartOfAccountRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateChartOfAccountInput): Promise<ChartOfAccount> {
    return this.prisma.chartOfAccount.create({ data: input });
  }

  findById(id: string): Promise<ChartOfAccount | null> {
    return this.prisma.chartOfAccount.findUnique({ where: { id } });
  }

  findByCode(companyId: string, accountCode: string): Promise<ChartOfAccount | null> {
    return this.prisma.chartOfAccount.findUnique({
      where: { companyId_accountCode: { companyId, accountCode } },
    });
  }

  list(companyId: string, accountType?: AccountType): Promise<ChartOfAccount[]> {
    return this.prisma.chartOfAccount.findMany({
      where: { companyId, accountType },
      orderBy: { accountCode: 'asc' },
    });
  }
}

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface CreateJournalInput {
  companyId: string;
  journalNumber: string;
  journalDate: Date;
  memo?: string;
  sourceType: string;
  sourceId?: string;
  createdByUserId?: string;
  lines: JournalLineInput[];
}

const JOURNAL_INCLUDE = { lines: true } as const;
export type JournalWithLines = Journal & { lines: JournalLine[] };

export class JournalRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(client: Client, input: CreateJournalInput): Promise<JournalWithLines> {
    return client.journal.create({
      data: {
        companyId: input.companyId,
        journalNumber: input.journalNumber,
        journalDate: input.journalDate,
        memo: input.memo,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        createdByUserId: input.createdByUserId,
        lines: { create: input.lines },
      },
      include: JOURNAL_INCLUDE,
    });
  }

  findById(id: string): Promise<JournalWithLines | null> {
    return this.prisma.journal.findUnique({ where: { id }, include: JOURNAL_INCLUDE });
  }

  list(filters: { companyId: string; sourceType?: string }): Promise<JournalWithLines[]> {
    return this.prisma.journal.findMany({
      where: { companyId: filters.companyId, sourceType: filters.sourceType },
      include: JOURNAL_INCLUDE,
      orderBy: { journalDate: 'desc' },
    });
  }

  /**
   * JournalLine is a pure child (no companyId of its own — scoped transitively via its parent
   * Journal), so this join filter is applied by hand, same as OrderLineItem elsewhere.
   */
  listLinesForCompany(
    companyId: string,
  ): Promise<Array<{ accountId: string; debit: unknown; credit: unknown }>> {
    return this.prisma.journalLine.findMany({
      where: { journal: { companyId } },
      select: { accountId: true, debit: true, credit: true },
    });
  }
}

export interface InvoiceItemInput {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface CreateInvoiceInput {
  companyId: string;
  invoiceNumber: string;
  orderId: string;
  customerId: string;
  currency: string;
  subtotal: number;
  totalAmount: number;
  dueAt?: Date;
  items: InvoiceItemInput[];
}

const INVOICE_INCLUDE = { items: true } as const;
export type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

export class InvoiceRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(client: Client, input: CreateInvoiceInput): Promise<InvoiceWithItems> {
    return client.invoice.create({
      data: {
        companyId: input.companyId,
        invoiceNumber: input.invoiceNumber,
        orderId: input.orderId,
        customerId: input.customerId,
        currency: input.currency,
        subtotal: input.subtotal,
        totalAmount: input.totalAmount,
        dueAt: input.dueAt,
        status: 'ISSUED',
        items: { create: input.items },
      },
      include: INVOICE_INCLUDE,
    });
  }

  findById(id: string): Promise<InvoiceWithItems | null> {
    return this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
  }

  findByOrderId(orderId: string): Promise<InvoiceWithItems | null> {
    return this.prisma.invoice.findUnique({ where: { orderId }, include: INVOICE_INCLUDE });
  }

  list(filters: {
    companyId: string;
    status?: InvoiceStatus;
    customerId?: string;
  }): Promise<InvoiceWithItems[]> {
    return this.prisma.invoice.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        customerId: filters.customerId,
      },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    return this.prisma.invoice.update({ where: { id }, data: { status } });
  }

  incrementAmountPaid(id: string, amount: number): Promise<Invoice> {
    return this.prisma.invoice.update({
      where: { id },
      data: { amountPaid: { increment: amount } },
    });
  }
}

export interface CreatePaymentInput {
  companyId: string;
  entityType: string;
  entityId: string;
  amount: number;
  currency: string;
  method?: string;
  reference?: string;
  createdByUserId?: string;
}

export class PaymentRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreatePaymentInput): Promise<Payment> {
    return this.prisma.payment.create({ data: input });
  }

  listForEntity(companyId: string, entityType: string, entityId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { companyId, entityType, entityId },
      orderBy: { paidAt: 'desc' },
    });
  }
}

export interface CreateSupplierBillInput {
  companyId: string;
  billNumber: string;
  purchaseOrderId: string;
  supplierId: string;
  goodsReceiptId?: string;
  currency: string;
  totalAmount: number;
  dueAt?: Date;
}

export class SupplierBillRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  create(input: CreateSupplierBillInput): Promise<SupplierBill> {
    return this.prisma.supplierBill.create({ data: { ...input, status: 'ISSUED' } });
  }

  findById(id: string): Promise<SupplierBill | null> {
    return this.prisma.supplierBill.findUnique({ where: { id } });
  }

  list(filters: {
    companyId: string;
    status?: SupplierBillStatus;
    supplierId?: string;
  }): Promise<SupplierBill[]> {
    return this.prisma.supplierBill.findMany({
      where: {
        companyId: filters.companyId,
        status: filters.status,
        supplierId: filters.supplierId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  updateStatus(id: string, status: SupplierBillStatus): Promise<SupplierBill> {
    return this.prisma.supplierBill.update({ where: { id }, data: { status } });
  }

  incrementAmountPaid(id: string, amount: number): Promise<SupplierBill> {
    return this.prisma.supplierBill.update({
      where: { id },
      data: { amountPaid: { increment: amount } },
    });
  }
}
