import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { SupplierService } from '@modules/procurement';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AddSupplierContactDto, CreateSupplierDto, UpdateSupplierDto } from './dto/procurement.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SupplierService) {}

  @RequirePermission('procurement', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateSupplierDto, @Req() req: AuthedRequest) {
    return this.suppliers.create(
      { companyId: req.user.companyId, ...dto },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('status') status?: string) {
    return this.suppliers.list({ companyId: req.user.companyId, status: status as never });
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.getById(id);
  }

  @RequirePermission('procurement', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: AuthedRequest,
  ) {
    return this.suppliers.update(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('procurement', PermissionAction.EDIT)
  @Post(':id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.suppliers.transitionStatus(id, 'SUSPENDED', req.user.sub, req.ip ?? null);
  }

  @RequirePermission('procurement', PermissionAction.EDIT)
  @Post(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.suppliers.transitionStatus(id, 'ACTIVE', req.user.sub, req.ip ?? null);
  }

  @RequirePermission('procurement', PermissionAction.EDIT)
  @Post(':id/contacts')
  addContact(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSupplierContactDto) {
    return this.suppliers.addContact(id, dto);
  }

  @RequirePermission('procurement', PermissionAction.VIEW)
  @Get(':id/contacts')
  listContacts(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliers.listContacts(id);
  }
}
