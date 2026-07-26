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
import { OrderService } from '@modules/orders';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  AmendOrderDto,
  CreateOrderDirectDto,
  CreateOrderFromQuotationDto,
  DecideApprovalDto,
  FulfillLineDto,
  RequestApprovalDto,
} from './dto/order.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrderService) {}

  @RequirePermission('orders', PermissionAction.CREATE)
  @Post('from-quotation')
  createFromQuotation(@Body() dto: CreateOrderFromQuotationDto, @Req() req: AuthedRequest) {
    return this.orders.createFromQuotation(
      req.user.companyId,
      dto.orderNumber,
      dto.quotationId,
      req.user.sub,
      req.ip ?? null,
      dto.warehouseId,
    );
  }

  @RequirePermission('orders', PermissionAction.CREATE)
  @Post('direct')
  createDirect(@Body() dto: CreateOrderDirectDto, @Req() req: AuthedRequest) {
    return this.orders.createDirect(req.user.companyId, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('orders', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.orders.list({ companyId: req.user.companyId, status: status as never, customerId });
  }

  @RequirePermission('orders', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getById(id);
  }

  @RequirePermission('orders', PermissionAction.EDIT)
  @Post(':id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.orders.confirm(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('orders', PermissionAction.EDIT)
  @Post(':id/hold')
  hold(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.orders.hold(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('orders', PermissionAction.EDIT)
  @Post(':id/release')
  release(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.orders.release(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('orders', PermissionAction.EDIT)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.orders.cancel(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('orders', PermissionAction.EDIT)
  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.orders.close(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('orders', PermissionAction.EDIT)
  @Post(':id/fulfill-line')
  fulfillLine(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FulfillLineDto,
    @Req() req: AuthedRequest,
  ) {
    return this.orders.fulfillLine(
      id,
      dto.lineItemId,
      dto.fulfilledQuantity,
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('orders', PermissionAction.EDIT)
  @Post(':id/amend')
  amend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AmendOrderDto,
    @Req() req: AuthedRequest,
  ) {
    return this.orders.amend(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('orders', PermissionAction.APPROVE)
  @Post(':id/request-approval')
  requestApproval(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestApprovalDto,
    @Req() req: AuthedRequest,
  ) {
    return this.orders.requestApproval(id, req.user.sub, dto.attributes ?? {});
  }

  @RequirePermission('orders', PermissionAction.APPROVE)
  @Post('approve')
  decideApproval(@Body() dto: DecideApprovalDto, @Req() req: AuthedRequest) {
    return this.orders.decideApproval(
      dto.approvalId,
      dto.decision,
      req.user.sub,
      dto.comment,
      req.ip ?? null,
    );
  }

  /**
   * The documented manual-retry path for the confirmation saga's one known failure mode (order
   * CONFIRMED, inventory reverted, no Invoice) — see docs/DOMAIN_MODEL_PHASE5.md.
   */
  @RequirePermission('orders', PermissionAction.EDIT)
  @Post(':id/retry-invoice')
  async retryInvoice(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    await this.orders.retryInvoiceGeneration(id, req.user.sub);
    return { ok: true };
  }
}
