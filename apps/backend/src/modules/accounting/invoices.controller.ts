import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { InvoiceService } from '@modules/accounting';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

/**
 * Invoices are generated automatically by OrderService's confirmation saga — see
 * docs/DOMAIN_MODEL_PHASE5.md. The manual-retry path for the saga's one known failure mode
 * (order CONFIRMED, inventory reverted, no Invoice) lives on OrdersController
 * (`POST /orders/:id/retry-invoice`), not here, since only OrderService holds both the order
 * snapshot and the InvoicingPort.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoiceService) {}

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.invoices.list({
      companyId: req.user.companyId,
      status: status as never,
      customerId,
    });
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.getById(id);
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get('by-order/:orderId')
  getByOrderId(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.invoices.getByOrderId(orderId);
  }
}
