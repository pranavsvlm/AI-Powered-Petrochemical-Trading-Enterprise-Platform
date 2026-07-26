import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type { TenantScopedPrismaClient, InvoiceStatus } from '@platform/database';
import { assertJournalBalances } from '../domain/journal-balance';
import {
  InvoiceRepository,
  JournalRepository,
  ChartOfAccountRepository,
  type InvoiceWithItems,
} from '../infrastructure/accounting.repository';

export interface InvoiceAuditWriter {
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

export interface InvoiceEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/**
 * The order snapshot InvoiceService needs to generate an invoice — passed by value from
 * OrderService (the saga's caller), which already holds the just-confirmed order's data in
 * hand. Deliberately NOT a callback/lookup port: OrderService is the only caller, and passing
 * the snapshot directly means InvoiceService (and AccountingModule) has no dependency on
 * @modules/orders at all, avoiding what would otherwise be a circular module dependency
 * (OrdersModule already depends on AccountingModule for InvoicingPort). See
 * docs/DOMAIN_MODEL_PHASE5.md.
 */
export interface OrderSnapshotForInvoicing {
  id: string;
  companyId: string;
  orderNumber: string;
  customerId: string;
  currency: string;
  subtotal: number;
  totalAmount: number;
  lineItems: Array<{ productId: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

/**
 * Published to @modules/orders — OrderService's confirmation saga calls this as step 3. See
 * docs/DOMAIN_MODEL_PHASE5.md for the full saga and its compensation.
 */
export interface InvoicingPort {
  generateInvoiceForOrder(order: OrderSnapshotForInvoicing, actorUserId: string): Promise<void>;
}

/**
 * Application-layer use case for the Invoice aggregate (doc 14): AR generation from a
 * confirmed order, one invoice per order. Posts a balanced AR/Revenue journal in the same
 * transaction as the Invoice row — if anything fails, the whole transaction rolls back,
 * leaving no partial Invoice/Journal residue (no separate compensation needed on this side;
 * only Inventory's already-committed dispatch needs the saga's explicit reversal).
 */
@Injectable()
export class InvoiceService implements InvoicingPort {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly repo: InvoiceRepository;
  private readonly journalRepo: JournalRepository;
  private readonly chartRepo: ChartOfAccountRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly events: InvoiceEventPublisher,
    private readonly audit: InvoiceAuditWriter,
  ) {
    this.repo = new InvoiceRepository(db);
    this.journalRepo = new JournalRepository(db);
    this.chartRepo = new ChartOfAccountRepository(db);
  }

  async generateInvoiceForOrder(
    order: OrderSnapshotForInvoicing,
    actorUserId: string,
  ): Promise<void> {
    const companyId = order.companyId;
    const orderId = order.id;
    const totalAmount = order.totalAmount;

    const [arAccount, revenueAccount] = await Promise.all([
      this.chartRepo.findByCode(companyId, '1100'),
      this.chartRepo.findByCode(companyId, '4000'),
    ]);
    if (!arAccount || !revenueAccount) {
      throw new BadRequestException(
        'Chart of accounts is not seeded for this company — call ChartOfAccountsService.seedDefaultChart first.',
      );
    }

    const invoiceNumber = `INV-${order.orderNumber}`;
    const lines = [
      { debit: totalAmount, credit: 0 },
      { debit: 0, credit: totalAmount },
    ];
    assertJournalBalances(lines);

    const invoice = await this.db.$transaction(async (tx) => {
      const created = await this.repo.create(tx, {
        companyId,
        invoiceNumber,
        orderId,
        customerId: order.customerId,
        currency: order.currency,
        subtotal: order.subtotal,
        totalAmount,
        items: order.lineItems.map((li) => ({
          productId: li.productId,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          lineTotal: li.lineTotal,
        })),
      });

      await this.journalRepo.create(tx, {
        companyId,
        journalNumber: `JRN-${invoiceNumber}`,
        journalDate: new Date(),
        sourceType: 'Invoice',
        sourceId: created.id,
        createdByUserId: actorUserId,
        lines: [
          {
            accountId: arAccount.id,
            debit: totalAmount,
            credit: 0,
            description: `AR for ${invoiceNumber}`,
          },
          {
            accountId: revenueAccount.id,
            debit: 0,
            credit: totalAmount,
            description: `Revenue for ${invoiceNumber}`,
          },
        ],
      });

      return created;
    });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.INVOICE_GENERATED,
      entityType: 'Invoice',
      entityId: invoice.id,
      after: { invoiceNumber, orderId, totalAmount },
    });
    await this.events.publish(
      EVENT_TYPES.INVOICE_GENERATED,
      companyId,
      { invoiceId: invoice.id, orderId, totalAmount },
      'accounting',
    );
  }

  async getById(id: string): Promise<InvoiceWithItems> {
    const invoice = await this.repo.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return invoice;
  }

  async getByOrderId(orderId: string): Promise<InvoiceWithItems> {
    const invoice = await this.repo.findByOrderId(orderId);
    if (!invoice) throw new NotFoundException('No invoice exists for this order.');
    return invoice;
  }

  list(filters: {
    companyId: string;
    status?: InvoiceStatus;
    customerId?: string;
  }): Promise<InvoiceWithItems[]> {
    return this.repo.list(filters);
  }

  /** Called by PaymentService once a Payment row against this invoice is recorded. */
  async applyPayment(invoiceId: string, amount: number): Promise<void> {
    const invoice = await this.getById(invoiceId);
    const updated = await this.repo.incrementAmountPaid(invoiceId, amount);
    const nextStatus: InvoiceStatus =
      Number(updated.amountPaid) >= Number(updated.totalAmount) ? 'PAID' : 'PARTIALLY_PAID';
    if (nextStatus !== invoice.status) {
      await this.repo.updateStatus(invoiceId, nextStatus);
    }
  }
}
