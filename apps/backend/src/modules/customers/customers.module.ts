import { Module } from '@nestjs/common';
import {
  CustomerService,
  RealAiCustomerProfileProvider,
  type CustomerAuditReader,
} from '@modules/customers';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { RealAiDecisionProvider } from '@platform/ai';
import { CustomersController } from './customers.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildAiRouter, buildPromptTemplateService } from '../../common/ai/ai-factory';

@Module({
  controllers: [CustomersController],
  providers: [
    AuditService,
    {
      provide: CustomerService,
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
        // AuditLog is not tenant-scoped by the Prisma extension (nullable company_id), so
        // reads must filter by companyId explicitly — see packages/types' TENANT_SCOPED_MODELS note.
        const auditReader: CustomerAuditReader = {
          listForEntity: (companyId, entityType, entityId) =>
            prisma.client.auditLog.findMany({
              where: { companyId, entityType, entityId },
              orderBy: { createdAt: 'desc' },
            }),
        };
        return new CustomerService(db, approvalEvaluator, eventBus, audit, auditReader);
      },
      inject: [PrismaService, AuditService],
    },
    {
      provide: RealAiCustomerProfileProvider,
      useFactory: (prisma: PrismaService, customerService: CustomerService) =>
        new RealAiCustomerProfileProvider(
          buildAiRouter(prisma.client),
          buildPromptTemplateService(prisma.client),
          customerService,
        ),
      inject: [PrismaService, CustomerService],
    },
  ],
  exports: [CustomerService],
})
export class CustomersModule {}
