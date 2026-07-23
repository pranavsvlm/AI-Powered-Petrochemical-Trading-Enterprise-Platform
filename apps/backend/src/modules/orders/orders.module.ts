import { Module } from '@nestjs/common';
import {
  OrderService,
  type QuotationLookupPort,
  type CustomerLookupPort,
  type ProductLookupPort,
} from '@modules/orders';
import { QuotationService } from '@modules/quotations';
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
import { OrdersController } from './orders.controller';
import { QuotationsModule } from '../quotations/quotations.module';
import { ProductsModule } from '../products/products.module';
import { CustomersModule } from '../customers/customers.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  imports: [QuotationsModule, ProductsModule, CustomersModule],
  controllers: [OrdersController],
  providers: [
    AuditService,
    {
      provide: OrderService,
      useFactory: (
        prisma: PrismaService,
        audit: AuditService,
        quotationService: QuotationService,
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
        // All three call the owning module's own published method — never a raw query against
        // quotations'/products'/customers' tables. See docs/DOMAIN_MODEL_PHASE4.md §11.
        const quotationLookup: QuotationLookupPort = {
          getForOrderCreation: (quotationId) => quotationService.getForOrderCreation(quotationId),
          markConverted: async (quotationId, actorUserId) => {
            await quotationService.convertToOrder(quotationId, actorUserId);
          },
        };
        const customers: CustomerLookupPort = { getById: (id) => customerService.getById(id) };
        const products: ProductLookupPort = { getById: (id) => productService.getById(id) };
        return new OrderService(
          db,
          approvalEvaluator,
          eventBus,
          audit,
          quotationLookup,
          customers,
          products,
        );
      },
      inject: [PrismaService, AuditService, QuotationService, ProductService, CustomerService],
    },
  ],
  exports: [OrderService],
})
export class OrdersModule {}
