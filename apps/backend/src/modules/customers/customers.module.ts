import { Module } from '@nestjs/common';
import { CustomerService, type CustomerAuditReader } from '@modules/customers';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { CustomersController } from './customers.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';

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
          aiDecisionProvider: new NotImplementedAiDecisionProvider(),
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
  ],
  exports: [CustomerService],
})
export class CustomersModule {}
