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
import { InventoryService } from '@modules/inventory';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdjustStockDto } from './dto/inventory.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermission('inventory', PermissionAction.VIEW)
  @Get('items')
  listItems(@Req() req: AuthedRequest, @Query('warehouseId') warehouseId?: string) {
    return this.inventory.listInventoryItems(req.user.companyId, warehouseId);
  }

  @RequirePermission('inventory', PermissionAction.VIEW)
  @Get('items/:id')
  getItem(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.getInventoryItem(id);
  }

  @RequirePermission('inventory', PermissionAction.EDIT)
  @Post('items/:id/adjust')
  adjust(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustStockDto,
    @Req() req: AuthedRequest,
  ) {
    return this.inventory.adjustStock(
      req.user.companyId,
      id,
      dto.quantityDelta,
      dto.reason,
      req.user.sub,
    );
  }

  @RequirePermission('inventory', PermissionAction.VIEW)
  @Get('movements')
  listMovements(@Req() req: AuthedRequest, @Query('inventoryItemId') inventoryItemId?: string) {
    return this.inventory.listMovements(req.user.companyId, inventoryItemId);
  }
}
