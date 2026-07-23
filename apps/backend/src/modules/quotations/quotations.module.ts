import { Module } from '@nestjs/common';
import {
  RfqService,
  QuotationService,
  type PricingLookupPort,
  type CustomerLookupPort,
  type ProductLookupPort,
} from '@modules/quotations';
import { ProductService } from '@modules/products';
import { CustomerService } from '@modules/customers';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { RfqController, QuotationsController } from './quotations.controller';
import { ProductsModule } from '../products/products.module';
import { CustomersModule } from '../customers/customers.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [ProductsModule, CustomersModule],
  controllers: [RfqController, QuotationsController],
  providers: [
    AuditService,
    {
      provide: RfqService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        productService: ProductService,
        customerService: CustomerService,
      ) => {
        const db = prisma.client;
        const eventBus = new RedisStreamsEventBus();
        // Both call the owning module's own published getById — already tenant-scoped — never
        // a raw query against customers'/products' tables. See docs/DOMAIN_MODEL_PHASE4.md §11.
        const customers: CustomerLookupPort = { getById: (id) => customerService.getById(id) };
        const products: ProductLookupPort = { getById: (id) => productService.getById(id) };
        return new RfqService(db, eventBus, audit, customers, products);
      },
      inject: [PrismaService, AuditService, ProductService, CustomerService],
    },
    {
      provide: QuotationService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        rfqs: RfqService,
        productService: ProductService,
        customerService: CustomerService,
      ) => {
        const db = prisma.client;
        const eventBus = new RedisStreamsEventBus();
        const ruleRepository = new RuleRepository(db);
        const ruleActionExecutor = new RuleActionExecutor({
          eventBus,
          aiDecisionProvider: new NotImplementedAiDecisionProvider(),
        });
        const approvalEvaluator = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
          new LegacyApprovalRuleSource(db),
          new NativeRuleSource((companyId, module) =>
            ruleRepository.loadApplicable(companyId, module),
          ),
        ]);
        // Calls ProductService's/CustomerService's own published methods — never queries
        // products'/customers' tables directly.
        const pricing: PricingLookupPort = {
          getEffectivePrice: (companyId, productId, query) =>
            productService.getEffectivePrice(companyId, productId, query),
        };
        const customers: CustomerLookupPort = { getById: (id) => customerService.getById(id) };
        return new QuotationService(
          db,
          approvalEvaluator,
          eventBus,
          audit,
          pricing,
          rfqs,
          customers,
        );
      },
      inject: [PrismaService, AuditService, RfqService, ProductService, CustomerService],
    },
  ],
  exports: [RfqService, QuotationService],
})
export class QuotationsModule {}
