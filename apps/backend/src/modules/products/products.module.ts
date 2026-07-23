import { Module } from '@nestjs/common';
import { ProductService } from '@modules/products';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import {
  ProductsController,
  CategoriesController,
  ProductAttributesController,
  PriceListsController,
} from './products.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

@Module({
  controllers: [
    ProductsController,
    CategoriesController,
    ProductAttributesController,
    PriceListsController,
  ],
  providers: [
    AuditService,
    {
      provide: ProductService,
      useFactory: (prisma: PrismaService, audit: AuditService) => {
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
        return new ProductService(db, approvalEvaluator, eventBus, audit);
      },
      inject: [PrismaService, AuditService],
    },
  ],
  exports: [ProductService],
})
export class ProductsModule {}
