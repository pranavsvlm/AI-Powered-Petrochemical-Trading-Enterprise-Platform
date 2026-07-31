import { Module } from '@nestjs/common';
import {
  ProductService,
  RealAiPricingProvider,
  RealAiProductExpertProvider,
} from '@modules/products';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { RealAiDecisionProvider } from '@platform/ai';
import { PgVectorSearchProvider } from '@platform/search';
import {
  ProductsController,
  CategoriesController,
  ProductAttributesController,
  PriceListsController,
} from './products.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildAiRouter, buildPromptTemplateService } from '../../common/ai/ai-factory';

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
          aiDecisionProvider: new RealAiDecisionProvider(
            buildAiRouter(db),
            buildPromptTemplateService(db),
          ),
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
    {
      provide: RealAiPricingProvider,
      useFactory: (prisma: PrismaService, productService: ProductService) =>
        new RealAiPricingProvider(
          buildAiRouter(prisma.client),
          buildPromptTemplateService(prisma.client),
          productService,
        ),
      inject: [PrismaService, ProductService],
    },
    {
      provide: RealAiProductExpertProvider,
      useFactory: (prisma: PrismaService, productService: ProductService) => {
        const db = prisma.client;
        const vectorSearch = new PgVectorSearchProvider(db, buildAiRouter(db));
        return new RealAiProductExpertProvider(
          buildAiRouter(db),
          buildPromptTemplateService(db),
          productService,
          vectorSearch,
        );
      },
      inject: [PrismaService, ProductService],
    },
  ],
  exports: [ProductService],
})
export class ProductsModule {}
