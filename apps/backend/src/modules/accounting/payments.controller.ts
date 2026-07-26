import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { PaymentService } from '@modules/accounting';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { RecordPaymentDto } from './dto/accounting.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('invoices/:invoiceId/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentService) {}

  @RequirePermission('accounting', PermissionAction.CREATE)
  @Post()
  record(
    @Param('invoiceId', ParseUUIDPipe) invoiceId: string,
    @Body() dto: RecordPaymentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.payments.recordForInvoice(
      req.user.companyId,
      invoiceId,
      dto,
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get()
  list(@Param('invoiceId', ParseUUIDPipe) invoiceId: string, @Req() req: AuthedRequest) {
    return this.payments.listForInvoice(req.user.companyId, invoiceId);
  }
}
