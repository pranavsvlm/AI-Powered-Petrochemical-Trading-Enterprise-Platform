import { Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PluginService } from '@modules/extensibility';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@ApiTags('plugins')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('plugins')
export class PluginsController {
  constructor(private readonly plugins: PluginService) {}

  @RequirePermission('plugins', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.plugins.list(req.user.companyId);
  }

  @RequirePermission('plugins', PermissionAction.CREATE)
  @Post(':key/install')
  install(@Param('key') key: string, @Req() req: AuthedRequest) {
    return this.plugins.install(req.user.companyId, key, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('plugins', PermissionAction.EDIT)
  @Post(':key/activate')
  activate(@Param('key') key: string, @Req() req: AuthedRequest) {
    return this.plugins.activate(req.user.companyId, key, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('plugins', PermissionAction.EDIT)
  @Post(':key/deactivate')
  deactivate(@Param('key') key: string, @Req() req: AuthedRequest) {
    return this.plugins.deactivate(req.user.companyId, key, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('plugins', PermissionAction.DELETE)
  @Delete(':key')
  uninstall(@Param('key') key: string, @Req() req: AuthedRequest) {
    return this.plugins.uninstall(req.user.companyId, key, req.user.sub, req.ip ?? null);
  }
}
