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
import { SupplierBillService } from '@modules/accounting';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { GenerateSupplierBillDto } from './dto/accounting.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('supplier-bills')
export class SupplierBillsController {
  constructor(private readonly supplierBills: SupplierBillService) {}

  @RequirePermission('accounting', PermissionAction.CREATE)
  @Post('generate')
  generate(@Body() dto: GenerateSupplierBillDto, @Req() req: AuthedRequest) {
    return this.supplierBills.generateForPurchaseOrder(
      req.user.companyId,
      dto.purchaseOrderId,
      req.user.sub,
      dto.goodsReceiptId,
    );
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get()
  list(
    @Req() req: AuthedRequest,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.supplierBills.list({
      companyId: req.user.companyId,
      status: status as never,
      supplierId,
    });
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierBills.getById(id);
  }
}
