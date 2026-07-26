import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { TenantScopedPrismaClient, Payment } from '@platform/database';
import { PaymentRepository } from '../infrastructure/accounting.repository';
import { InvoiceService } from './invoice.service';

export interface PaymentAuditWriter {
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

export interface RecordPaymentInput {
  amount: number;
  currency: string;
  method?: string;
  reference?: string;
}

/**
 * Application-layer use case for the Payment aggregate (doc 14). Only 'Invoice' (AR) is wired
 * in Phase 5 — 'SupplierBill' (AP) payments are a documented future extension of the same
 * polymorphic entityType/entityId shape. Depends directly on InvoiceService (same module).
 */
@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly repo: PaymentRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: PaymentAuditWriter,
    private readonly invoices: InvoiceService,
  ) {
    this.repo = new PaymentRepository(db);
  }

  async recordForInvoice(
    companyId: string,
    invoiceId: string,
    input: RecordPaymentInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<Payment> {
    const invoice = await this.invoices.getById(invoiceId);
    if (invoice.companyId !== companyId) throw new NotFoundException('Invoice not found.');

    const payment = await this.repo.create({
      companyId,
      entityType: 'Invoice',
      entityId: invoiceId,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      reference: input.reference,
      createdByUserId: actorUserId,
    });
    await this.invoices.applyPayment(invoiceId, input.amount);

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.PAYMENT_RECORDED,
      entityType: 'Invoice',
      entityId: invoiceId,
      after: { paymentId: payment.id, amount: input.amount },
      ipAddress: ipAddress ?? null,
    });
    return payment;
  }

  listForInvoice(companyId: string, invoiceId: string): Promise<Payment[]> {
    return this.repo.listForEntity(companyId, 'Invoice', invoiceId);
  }
}
