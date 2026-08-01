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
import { CommsService } from '@modules/communication';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  AddParticipantDto,
  CreateTaskFromThreadDto,
  CreateThreadDto,
  SendMessageDto,
} from './dto/comms.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('comms/threads')
export class CommsController {
  constructor(private readonly comms: CommsService) {}

  @RequirePermission('communication', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateThreadDto, @Req() req: AuthedRequest) {
    return this.comms.createThread(
      { companyId: req.user.companyId, ...dto },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('communication', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('type') type?: string, @Query('status') status?: string) {
    return this.comms.list({
      companyId: req.user.companyId,
      type: type as never,
      status: status as never,
    });
  }

  @RequirePermission('communication', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.comms.getById(id);
  }

  @RequirePermission('communication', PermissionAction.EDIT)
  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.comms.close(id);
  }

  @RequirePermission('communication', PermissionAction.EDIT)
  @Post(':id/participants')
  addParticipant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddParticipantDto,
    @Req() req: AuthedRequest,
  ) {
    return this.comms.addParticipant(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('communication', PermissionAction.VIEW)
  @Get(':id/messages')
  listMessages(@Param('id', ParseUUIDPipe) id: string) {
    return this.comms.listMessages(id);
  }

  @RequirePermission('communication', PermissionAction.CREATE)
  @Post(':id/messages')
  sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
    @Req() req: AuthedRequest,
  ) {
    return this.comms.sendMessage(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('communication', PermissionAction.CREATE)
  @Post(':id/create-task')
  createTask(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTaskFromThreadDto,
    @Req() req: AuthedRequest,
  ) {
    return this.comms.createTaskFromThread(id, dto, req.user.sub);
  }
}
