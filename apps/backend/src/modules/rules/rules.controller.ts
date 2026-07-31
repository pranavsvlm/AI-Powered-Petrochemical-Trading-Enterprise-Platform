import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { getPrismaClient } from '@platform/database';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleConflictResolver,
  RuleEvaluationService,
  RuleManagementService,
  RuleRepository,
} from '@platform/rules-engine';
import { RealAiDecisionProvider } from '@platform/ai';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { buildAiRouter, buildPromptTemplateService } from '../../common/ai/ai-factory';
import { CreateRuleDto, EvaluateRuleDto, UpdateRuleDto } from './dto/rule.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

const prisma = getPrismaClient();
const eventBus = new RedisStreamsEventBus();
const repository = new RuleRepository(prisma);
const managementService = new RuleManagementService(prisma, repository);
const actionExecutor = new RuleActionExecutor({
  eventBus,
  aiDecisionProvider: new RealAiDecisionProvider(
    buildAiRouter(prisma),
    buildPromptTemplateService(prisma),
  ),
});
const evaluationService = new RuleEvaluationService(repository, actionExecutor, [
  new LegacyApprovalRuleSource(prisma),
  new NativeRuleSource((companyId, module) => repository.loadApplicable(companyId, module)),
]);

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rules')
export class RulesController {
  @RequirePermission('rules', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateRuleDto, @Req() req: AuthedRequest) {
    return managementService.create({
      companyId: req.user.companyId,
      name: dto.name,
      module: dto.module,
      priority: dto.priority,
      description: dto.description,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      condition: dto.condition as never,
      actions: dto.actions as never,
      actorUserId: req.user.sub,
    });
  }

  @RequirePermission('rules', PermissionAction.VIEW)
  @Get()
  list(@Query('module') module: string | undefined, @Req() req: AuthedRequest) {
    return repository.listByCompany(req.user.companyId, module);
  }

  @RequirePermission('rules', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return repository.findById(id);
  }

  @RequirePermission('rules', PermissionAction.EDIT)
  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto) {
    return managementService.update(id, {
      name: dto.name,
      priority: dto.priority,
      description: dto.description,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      condition: dto.condition as never,
      actions: dto.actions as never,
    });
  }

  @RequirePermission('rules', PermissionAction.DELETE)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return managementService.delete(id, req.user.sub);
  }

  @RequirePermission('rules', PermissionAction.MANAGE_SETTINGS)
  @Post(':id/publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return managementService.publish(id, req.user.sub);
  }

  @RequirePermission('rules', PermissionAction.EXECUTE_AI)
  @Post('evaluate')
  evaluate(@Body() dto: EvaluateRuleDto, @Req() req: AuthedRequest) {
    return evaluationService.evaluate(
      { module: dto.module, companyId: req.user.companyId, attributes: dto.attributes },
      false,
    );
  }

  @RequirePermission('rules', PermissionAction.EXECUTE_AI)
  @Post('simulate')
  async simulate(@Body() dto: EvaluateRuleDto, @Req() req: AuthedRequest) {
    const decision = await evaluationService.evaluate(
      { module: dto.module, companyId: req.user.companyId, attributes: dto.attributes },
      true,
    );
    const applicable = await repository.loadApplicable(req.user.companyId, dto.module);
    const conflicts = RuleConflictResolver.detectConflicts(applicable);
    return { decision, conflicts };
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rule-executions')
export class RuleExecutionsController {
  @RequirePermission('rules', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return prisma.ruleExecution.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
