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
import { GoodsReceiptService } from '@modules/procurement';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateGoodsReceiptDto } from './dto/procurement.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('goods-receipts')
export class GoodsReceiptsController {
  constructor(private readonly goodsReceipts: GoodsReceiptService) {}

  @RequirePermission('procurement', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateGoodsReceiptDto, @Req() req: AuthedRequest) {
    return this.goodsReceipts.create(req.user.companyId, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('purchaseOrderId') purchaseOrderId?: string) {
    return this.goodsReceipts.list({ companyId: req.user.companyId, purchaseOrderId });
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.goodsReceipts.getById(id);
  }
}
