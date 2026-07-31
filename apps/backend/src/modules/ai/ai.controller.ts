import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { AiFacadeService } from '@modules/ai';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  ChatDto,
  DecideExecutionDto,
  ExecuteDto,
  ListMemoryQueryDto,
  UpsertProviderDto,
} from './dto/ai.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiFacadeService) {}

  @RequirePermission('ai', PermissionAction.VIEW)
  @Get('agents')
  listAgents() {
    return this.ai.listAgents();
  }

  @RequirePermission('ai', PermissionAction.VIEW)
  @Get('agents/:key')
  getAgent(@Param('key') key: string) {
    return this.ai.getAgent(key);
  }

  @RequirePermission('ai', PermissionAction.EXECUTE_AI)
  @Post('chat')
  chat(@Body() dto: ChatDto, @Req() req: AuthedRequest) {
    return this.ai.run(
      dto.agentKey,
      req.user.companyId,
      req.user.sub,
      dto.message,
      dto.conversationId,
    );
  }

  @RequirePermission('ai', PermissionAction.EXECUTE_AI)
  @Post('execute')
  execute(@Body() dto: ExecuteDto, @Req() req: AuthedRequest) {
    return this.ai.run(dto.agentKey, req.user.companyId, req.user.sub, dto.message);
  }

  @RequirePermission('ai', PermissionAction.VIEW)
  @Get('executions')
  listExecutions() {
    return this.ai.listExecutions();
  }

  @RequirePermission('ai', PermissionAction.VIEW)
  @Get('executions/:id')
  getExecution(@Param('id', ParseUUIDPipe) id: string) {
    return this.ai.getExecution(id);
  }

  @RequirePermission('ai', PermissionAction.APPROVE)
  @Post('executions/:id/approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideExecutionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.ai.approve(id, req.user.companyId, req.user.sub, dto.comment);
  }

  @RequirePermission('ai', PermissionAction.APPROVE)
  @Post('executions/:id/reject')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideExecutionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.ai.reject(id, req.user.companyId, req.user.sub, dto.comment);
  }

  @RequirePermission('ai', PermissionAction.MANAGE_SETTINGS)
  @Get('memory')
  listMemory(@Query() dto: ListMemoryQueryDto) {
    return this.ai.listMemory(dto.scopeType, dto.scopeId);
  }

  @RequirePermission('ai', PermissionAction.MANAGE_SETTINGS)
  @Get('providers')
  listProviders(@Req() req: AuthedRequest) {
    return this.ai.listProviders(req.user.companyId);
  }

  @RequirePermission('ai', PermissionAction.MANAGE_SETTINGS)
  @Post('providers')
  upsertProvider(@Body() dto: UpsertProviderDto, @Req() req: AuthedRequest) {
    const { provider, ...data } = dto;
    return this.ai.upsertProvider(req.user.companyId, provider, data);
  }
}
