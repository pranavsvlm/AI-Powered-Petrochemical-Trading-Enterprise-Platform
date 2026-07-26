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
import { RequisitionService } from '@modules/procurement';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateRequisitionDto, DecideApprovalDto } from './dto/procurement.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('requisitions')
export class RequisitionsController {
  constructor(private readonly requisitions: RequisitionService) {}

  @RequirePermission('procurement', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateRequisitionDto, @Req() req: AuthedRequest) {
    return this.requisitions.create(
      { companyId: req.user.companyId, requestedByUserId: req.user.sub, ...dto },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.requisitions.list({ companyId: req.user.companyId, status: status as never });
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.requisitions.getById(id);
  }

  @RequirePermission('procurement', PermissionAction.EDIT)
  @Post(':id/submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.requisitions.submit(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('procurement', PermissionAction.APPROVE)
  @Post('approve')
  decideApproval(@Body() dto: DecideApprovalDto, @Req() req: AuthedRequest) {
    return this.requisitions.decideApproval(
      dto.approvalId,
      dto.decision,
      req.user.sub,
      dto.comment,
      req.ip ?? null,
    );
  }
}
