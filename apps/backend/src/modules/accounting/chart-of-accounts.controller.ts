import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { ChartOfAccountsService } from '@modules/accounting';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateChartOfAccountDto } from './dto/accounting.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('chart-of-accounts')
export class ChartOfAccountsController {
  constructor(private readonly chartOfAccounts: ChartOfAccountsService) {}

  @RequirePermission('accounting', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateChartOfAccountDto, @Req() req: AuthedRequest) {
    return this.chartOfAccounts.create(
      { companyId: req.user.companyId, ...dto },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('accounting', PermissionAction.MANAGE_SETTINGS)
  @Post('seed-defaults')
  seedDefaultChart(@Req() req: AuthedRequest) {
    return this.chartOfAccounts.seedDefaultChart(req.user.companyId, req.user.sub);
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('accountType') accountType?: string) {
    return this.chartOfAccounts.list(req.user.companyId, accountType as never);
  }
}
