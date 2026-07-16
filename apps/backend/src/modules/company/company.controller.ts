import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CompanyService } from '@modules/company';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateCompanyDto, SetFeatureDto, UpdateCompanyDto } from './dto/company.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @RequirePermission('company', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateCompanyDto, @Req() req: AuthedRequest) {
    return this.companyService.create(dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('company', PermissionAction.VIEW)
  @Get()
  list() {
    return this.companyService.list();
  }

  @RequirePermission('company', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.companyService.getById(id);
  }

  @RequirePermission('company', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @Req() req: AuthedRequest,
  ) {
    return this.companyService.update(id, dto, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('company', PermissionAction.EDIT)
  @Post(':id/suspend')
  suspend(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.companyService.suspend(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('company', PermissionAction.EDIT)
  @Post(':id/activate')
  activate(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.companyService.activate(id, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('company', PermissionAction.VIEW)
  @Get(':id/features')
  listFeatures(@Param('id', ParseUUIDPipe) id: string) {
    return this.companyService.listFeatures(id);
  }

  @RequirePermission('company', PermissionAction.MANAGE_SETTINGS)
  @Put(':id/features')
  setFeature(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetFeatureDto,
    @Req() req: AuthedRequest,
  ) {
    return this.companyService.setFeature(
      id,
      dto.moduleName,
      dto.enabled,
      req.user.sub,
      req.ip ?? null,
    );
  }
}
