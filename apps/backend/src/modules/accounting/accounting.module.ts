import { Module } from '@nestjs/common';
import {
  ChartOfAccountsService,
  JournalService,
  InvoiceService,
  PaymentService,
  SupplierBillService,
  ReportsService,
  type PurchaseOrderLookupPort,
} from '@modules/accounting';
import { PurchaseOrderService } from '@modules/procurement';
import { RedisStreamsEventBus } from '@platform/event-bus';
import { ChartOfAccountsController } from './chart-of-accounts.controller';
import { JournalsController } from './journals.controller';
import { InvoicesController } from './invoices.controller';
import { PaymentsController } from './payments.controller';
import { SupplierBillsController } from './supplier-bills.controller';
import { ReportsController } from './reports.controller';
import { ProcurementModule } from '../procurement/procurement.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [ProcurementModule],
  controllers: [
    ChartOfAccountsController,
    JournalsController,
    InvoicesController,
    PaymentsController,
    SupplierBillsController,
    ReportsController,
  ],
  providers: [
    AuditService,
    {
      provide: ChartOfAccountsService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new ChartOfAccountsService(prisma.client, audit),
      inject: [PrismaService, AuditService],
    },
    {
      provide: JournalService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new JournalService(prisma.client, new RedisStreamsEventBus(), audit),
      inject: [PrismaService, AuditService],
    },
    {
      provide: InvoiceService,
      useFactory: (prisma: PrismaService, audit: AuditService) =>
        new InvoiceService(prisma.client, new RedisStreamsEventBus(), audit),
      inject: [PrismaService, AuditService],
    },
    {
      provide: PaymentService,
      useFactory: (prisma: PrismaService, audit: AuditService, invoiceService: InvoiceService) =>
        new PaymentService(prisma.client, audit, invoiceService),
      inject: [PrismaService, AuditService, InvoiceService],
    },
    {
      provide: SupplierBillService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        purchaseOrderService: PurchaseOrderService,
      ) => {
        const purchaseOrders: PurchaseOrderLookupPort = {
          getById: (id) => purchaseOrderService.getById(id),
        };
        return new SupplierBillService(
          prisma.client,
          new RedisStreamsEventBus(),
          audit,
          purchaseOrders,
        );
      },
      inject: [PrismaService, AuditService, PurchaseOrderService],
    },
    {
      provide: ReportsService,
      useFactory: (prisma: PrismaService) => new ReportsService(prisma.client),
      inject: [PrismaService],
    },
  ],
  exports: [
    ChartOfAccountsService,
    JournalService,
    InvoiceService,
    PaymentService,
    SupplierBillService,
    ReportsService,
  ],
})
export class AccountingModule {}
