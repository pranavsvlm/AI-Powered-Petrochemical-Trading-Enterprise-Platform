import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import { ReportsService } from '@modules/accounting';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get('trial-balance')
  trialBalance(@Req() req: AuthedRequest) {
    return this.reports.trialBalance(req.user.companyId);
  }

  @RequirePermission('accounting', PermissionAction.VIEW)
  @Get('profit-and-loss')
  profitAndLoss(@Req() req: AuthedRequest) {
    return this.reports.profitAndLoss(req.user.companyId);
  }
}
