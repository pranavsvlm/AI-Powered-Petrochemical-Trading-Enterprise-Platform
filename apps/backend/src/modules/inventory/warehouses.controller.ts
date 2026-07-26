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
import { CreateWarehouseDto } from './dto/inventory.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly inventory: InventoryService) {}

  @RequirePermission('inventory', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateWarehouseDto, @Req() req: AuthedRequest) {
    return this.inventory.createWarehouse(req.user.companyId, dto, req.user.sub);
  }

  @RequirePermission('inventory', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.inventory.listWarehouses(req.user.companyId, status as never);
  }

  @RequirePermission('inventory', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventory.getWarehouseById(id);
  }
}
