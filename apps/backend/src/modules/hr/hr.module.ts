import { Module } from '@nestjs/common';
import {
  EmployeeService,
  AttendanceService,
  LeaveService,
  EmployeeRecordsService,
  type ApprovalEvaluator,
  type DepartmentLookupPort,
  type HrAuditWriter,
  type TeamLookupPort,
} from '@modules/hr';
import { UserService } from '@modules/users';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { RealAiDecisionProvider } from '@platform/ai';
import {
  EmployeesController,
  AttendanceController,
  LeaveController,
  EmployeeRecordsController,
} from './hr.controller';
import { UsersModule } from '../users/users.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { buildAiRouter, buildPromptTemplateService } from '../../common/ai/ai-factory';

@Module({
  imports: [UsersModule],
  controllers: [
    EmployeesController,
    AttendanceController,
    LeaveController,
    EmployeeRecordsController,
  ],
  providers: [
    AuditService,
    {
      provide: EmployeeService,
      useFactory: (prisma: PrismaService, audit: AuditService, users: UserService) => {
        const departments: DepartmentLookupPort = { getById: (id) => users.getDepartmentById(id) };
        const teams: TeamLookupPort = { getById: (id) => users.getTeamById(id) };
        const auditWriter: HrAuditWriter = audit;
        return new EmployeeService(prisma.client, departments, teams, auditWriter);
      },
      inject: [PrismaService, AuditService, UserService],
    },
    {
      provide: AttendanceService,
      useFactory: (prisma: PrismaService, audit: AuditService) => {
        const auditWriter: HrAuditWriter = audit;
        return new AttendanceService(prisma.client, auditWriter);
      },
      inject: [PrismaService, AuditService],
    },
    {
      provide: LeaveService,
      useFactory: (prisma: PrismaService, audit: AuditService) => {
        const db = prisma.client;
        const eventBus = new RedisStreamsEventBus();
        const aiRouter = buildAiRouter(db);
        const prompts = buildPromptTemplateService(db);
        const ruleRepository = new RuleRepository(db);
        const ruleActionExecutor = new RuleActionExecutor({
          eventBus,
          aiDecisionProvider: new RealAiDecisionProvider(aiRouter, prompts),
        });
        const approvalEvaluator: ApprovalEvaluator = new RuleEvaluationService(
          ruleRepository,
          ruleActionExecutor,
          [
            new LegacyApprovalRuleSource(db),
            new NativeRuleSource((companyId, module) =>
              ruleRepository.loadApplicable(companyId, module),
            ),
          ],
        );
        const auditWriter: HrAuditWriter = audit;
        return new LeaveService(db, approvalEvaluator, auditWriter);
      },
      inject: [PrismaService, AuditService],
    },
    {
      provide: EmployeeRecordsService,
      useFactory: (prisma: PrismaService, audit: AuditService) => {
        const auditWriter: HrAuditWriter = audit;
        return new EmployeeRecordsService(prisma.client, auditWriter);
      },
      inject: [PrismaService, AuditService],
    },
  ],
  exports: [EmployeeService, AttendanceService, LeaveService, EmployeeRecordsService],
})
export class HrModule {}
