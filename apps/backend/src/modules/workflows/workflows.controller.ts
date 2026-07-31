import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { getPrismaClient } from '@platform/database';
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
  NodeExecutor,
  PdfKitDocumentGenerator,
  WorkflowExecutionEngine,
  WorkflowManagementService,
  WorkflowResumeQueue,
} from '@platform/workflow';
import {
  NotificationService,
  ChannelAdapterRegistry,
  ConsoleEmailSenderAdapter,
} from '@platform/notifications';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { buildAiRouter, buildPromptTemplateService } from '../../common/ai/ai-factory';
import { CreateWorkflowDto, StartWorkflowDto } from './dto/workflow.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

const prisma = getPrismaClient();
const eventBus = new RedisStreamsEventBus();
const aiDecisionProvider = new RealAiDecisionProvider(
  buildAiRouter(prisma),
  buildPromptTemplateService(prisma),
);
const ruleRepository = new RuleRepository(prisma);
const ruleActionExecutor = new RuleActionExecutor({
  eventBus,
  aiDecisionProvider,
});
const rulesEvaluationService = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
  new LegacyApprovalRuleSource(prisma),
  new NativeRuleSource((companyId, module) => ruleRepository.loadApplicable(companyId, module)),
]);
const notificationRegistry = new ChannelAdapterRegistry(new ConsoleEmailSenderAdapter());
const notificationService = new NotificationService(notificationRegistry, prisma);
const resumeQueue = new WorkflowResumeQueue();
const nodeExecutor = new NodeExecutor({
  prisma,
  rulesEngine: rulesEvaluationService,
  notificationClient: {
    notify: (input) =>
      notificationService.send(input as never).then((n) => ({ notificationId: n.id })),
  },
  documentGenerator: new PdfKitDocumentGenerator(),
  aiDecisionProvider,
  enqueueDelay: (executionId, resumeAt) => resumeQueue.enqueue(executionId, resumeAt),
});
const executionEngine = new WorkflowExecutionEngine(nodeExecutor, prisma);
const managementService = new WorkflowManagementService(prisma);

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('workflows')
export class WorkflowsController {
  @RequirePermission('workflows', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateWorkflowDto, @Req() req: AuthedRequest) {
    return managementService.create({
      companyId: req.user.companyId,
      name: dto.name,
      description: dto.description,
      triggerType: dto.triggerType,
      triggerConfig: dto.triggerConfig,
      graph: { nodes: dto.nodes as never, edges: dto.edges as never },
      actorUserId: req.user.sub,
    });
  }

  @RequirePermission('workflows', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return prisma.workflow.findMany({
      where: { companyId: req.user.companyId },
      include: { versions: true },
    });
  }

  @RequirePermission('workflows', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return prisma.workflow.findUnique({ where: { id }, include: { versions: true } });
  }

  @RequirePermission('workflows', PermissionAction.MANAGE_SETTINGS)
  @Post(':id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return managementService.publish(id, req.user.sub);
  }

  @RequirePermission('workflows', PermissionAction.EXECUTE_AI)
  @Post(':id/simulate')
  async simulate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartWorkflowDto,
    @Req() req: AuthedRequest,
  ) {
    const graph = await managementService.loadPublishedGraph(id);
    return executionEngine.start(graph, id, req.user.companyId, dto.context ?? {}, true);
  }

  @RequirePermission('workflows', PermissionAction.EXECUTE_AI)
  @Post(':id/start')
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StartWorkflowDto,
    @Req() req: AuthedRequest,
  ) {
    const graph = await managementService.loadPublishedGraph(id);
    return executionEngine.start(graph, id, req.user.companyId, dto.context ?? {}, false);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('workflow-executions')
export class WorkflowExecutionsController {
  @RequirePermission('workflows', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return prisma.workflowExecution.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  @RequirePermission('workflows', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return prisma.workflowExecution.findUnique({
      where: { id },
      include: { tasks: true, approvals: true },
    });
  }
}
