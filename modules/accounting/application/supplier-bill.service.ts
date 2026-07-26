import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type {
  TenantScopedPrismaClient,
  SupplierBill,
  SupplierBillStatus,
} from '@platform/database';
import {
  SupplierBillRepository,
  JournalRepository,
  ChartOfAccountRepository,
} from '../infrastructure/accounting.repository';

export interface SupplierBillAuditWriter {
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

export interface SupplierBillEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/** Published by @modules/procurement, satisfied by PurchaseOrderService.getById. */
export interface PurchaseOrderLookupPort {
  getById(purchaseOrderId: string): Promise<{
    id: string;
    companyId: string;
    poNumber: string;
    supplierId: string;
    currency: string;
    totalAmount: unknown;
  }>;
}

/**
 * Application-layer use case for the SupplierBill aggregate (doc 14): AP generation from a
 * purchase order (typically once goods have been received). Posts a balanced
 * Inventory/AccountsPayable journal in the same transaction as the SupplierBill row — kept
 * minimal, one row, no separate line-item breakout, per the ratified Phase 5 scope.
 */
@Injectable()
export class SupplierBillService {
  private readonly logger = new Logger(SupplierBillService.name);
  private readonly repo: SupplierBillRepository;
  private readonly journalRepo: JournalRepository;
  private readonly chartRepo: ChartOfAccountRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly events: SupplierBillEventPublisher,
    private readonly audit: SupplierBillAuditWriter,
    private readonly purchaseOrders: PurchaseOrderLookupPort,
  ) {
    this.repo = new SupplierBillRepository(db);
    this.journalRepo = new JournalRepository(db);
    this.chartRepo = new ChartOfAccountRepository(db);
  }

  async generateForPurchaseOrder(
    companyId: string,
    purchaseOrderId: string,
    actorUserId: string,
    goodsReceiptId?: string,
  ): Promise<SupplierBill> {
    const po = await this.purchaseOrders.getById(purchaseOrderId);
    const totalAmount = Number(po.totalAmount);

    const [inventoryAccount, apAccount] = await Promise.all([
      this.chartRepo.findByCode(companyId, '1200'),
      this.chartRepo.findByCode(companyId, '2000'),
    ]);
    if (!inventoryAccount || !apAccount) {
      throw new BadRequestException(
        'Chart of accounts is not seeded for this company — call ChartOfAccountsService.seedDefaultChart first.',
      );
    }

    const billNumber = `BILL-${po.poNumber}`;

    const bill = await this.db.$transaction(async (tx) => {
      const created = await tx.supplierBill.create({
        data: {
          companyId,
          billNumber,
          purchaseOrderId,
          supplierId: po.supplierId,
          goodsReceiptId,
          currency: po.currency,
          totalAmount,
          status: 'ISSUED',
        },
      });

      await this.journalRepo.create(tx, {
        companyId,
        journalNumber: `JRN-${billNumber}`,
        journalDate: new Date(),
        sourceType: 'SupplierBill',
        sourceId: created.id,
        createdByUserId: actorUserId,
        lines: [
          {
            accountId: inventoryAccount.id,
            debit: totalAmount,
            credit: 0,
            description: `Inventory for ${billNumber}`,
          },
          {
            accountId: apAccount.id,
            debit: 0,
            credit: totalAmount,
            description: `AP for ${billNumber}`,
          },
        ],
      });

      return created;
    });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.SUPPLIER_BILL_CREATED,
      entityType: 'SupplierBill',
      entityId: bill.id,
      after: { billNumber, purchaseOrderId, totalAmount },
    });
    await this.events.publish(
      EVENT_TYPES.SUPPLIER_BILL_CREATED,
      companyId,
      { supplierBillId: bill.id, purchaseOrderId, totalAmount },
      'accounting',
    );
    return bill;
  }

  async getById(id: string): Promise<SupplierBill> {
    const bill = await this.repo.findById(id);
    if (!bill) throw new NotFoundException('Supplier bill not found.');
    return bill;
  }

  list(filters: {
    companyId: string;
    status?: SupplierBillStatus;
    supplierId?: string;
  }): Promise<SupplierBill[]> {
    return this.repo.list(filters);
  }

  async recordPayment(id: string, amount: number): Promise<SupplierBill> {
    const bill = await this.getById(id);
    const updated = await this.repo.incrementAmountPaid(id, amount);
    const nextStatus: SupplierBillStatus =
      Number(updated.amountPaid) >= Number(updated.totalAmount) ? 'PAID' : bill.status;
    if (nextStatus !== bill.status) {
      return this.repo.updateStatus(id, nextStatus);
    }
    return updated;
  }
}
