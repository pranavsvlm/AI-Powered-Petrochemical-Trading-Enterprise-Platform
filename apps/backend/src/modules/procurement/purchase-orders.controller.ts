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
import { PurchaseOrderService } from '@modules/procurement';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  CreatePurchaseOrderDirectDto,
  CreatePurchaseOrderFromRequisitionDto,
  DecideApprovalDto,
} from './dto/procurement.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrderService) {}

  @RequirePermission('procurement', PermissionAction.CREATE)
  @Post('direct')
  createDirect(@Body() dto: CreatePurchaseOrderDirectDto, @Req() req: AuthedRequest) {
    return this.purchaseOrders.createDirect(req.user.companyId, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('procurement', PermissionAction.CREATE)
  @Post('from-requisition')
  createFromRequisition(
    @Body() dto: CreatePurchaseOrderFromRequisitionDto,
    @Req() req: AuthedRequest,
  ) {
    return this.purchaseOrders.createFromRequisition(
      req.user.companyId,
      dto.poNumber,
      dto.requisitionId,
      dto.supplierId,
      dto.currency,
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.purchaseOrders.list({
      companyId: req.user.companyId,
      status: status as never,
      supplierId,
    });
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrders.getById(id);
  }

  @RequirePermission('procurement', PermissionAction.APPROVE)
  @Post(':id/request-approval')
  requestApproval(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.purchaseOrders.requestApproval(id, req.user.sub);
  }

  @RequirePermission('procurement', PermissionAction.APPROVE)
  @Post('approve')
  decideApproval(@Body() dto: DecideApprovalDto, @Req() req: AuthedRequest) {
    return this.purchaseOrders.decideApproval(
      dto.approvalId,
      dto.decision,
      req.user.sub,
      dto.comment,
      req.ip ?? null,
    );
  }

  @RequirePermission('procurement', PermissionAction.EDIT)
  @Post(':id/send')
  send(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.purchaseOrders.send(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('procurement', PermissionAction.EDIT)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.purchaseOrders.cancel(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('procurement', PermissionAction.EDIT)
  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.purchaseOrders.close(id, req.user.sub, req.ip ?? null);
  }
}
