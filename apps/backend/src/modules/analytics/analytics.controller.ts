import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PermissionAction, type JwtAccessTokenPayload } from '@platform/types';
import type { ForecastType, ReportType } from '@platform/database';
import {
  AnalyticsKpiService,
  AnalyticsForecastService,
  AnalyticsInsightService,
  AnalyticsReportService,
} from '@modules/reports';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CreateScheduleDto, GenerateReportDto } from './dto/analytics.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

const DASHBOARD_SECTIONS = [
  'executive',
  'sales',
  'trading',
  'finance',
  'inventory',
  'procurement',
  'ai',
] as const;
type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly kpis: AnalyticsKpiService,
    private readonly forecasts: AnalyticsForecastService,
    private readonly insights: AnalyticsInsightService,
    private readonly reports: AnalyticsReportService,
  ) {}

  @RequirePermission('analytics', PermissionAction.VIEW)
  @Get('dashboard/:section')
  getDashboard(@Param('section') section: DashboardSection, @Req() req: AuthedRequest) {
    const companyId = req.user.companyId;
    switch (section) {
      case 'executive':
        return this.kpis.getExecutiveKpis(companyId);
      case 'sales':
        return this.kpis.getSalesKpis(companyId);
      case 'trading':
        return this.kpis.getTradingKpis(companyId);
      case 'finance':
        return this.kpis.getFinanceKpis(companyId);
      case 'inventory':
        return this.kpis.getInventoryKpis(companyId);
      case 'procurement':
        return this.kpis.getProcurementKpis(companyId);
      case 'ai':
        return this.kpis.getAiKpis(companyId);
    }
  }

  @RequirePermission('analytics', PermissionAction.VIEW)
  @Get('kpis')
  getKpis(@Req() req: AuthedRequest) {
    return this.kpis.buildSnapshotMetrics(req.user.companyId);
  }

  @RequirePermission('analytics', PermissionAction.VIEW)
  @Get('forecast/:type')
  getForecast(@Param('type') type: ForecastType, @Req() req: AuthedRequest) {
    void type; // only 'SALES' exists this phase — see docs/DOMAIN_MODEL_PHASE7.md
    return this.forecasts.getLatestSalesForecast(req.user.companyId);
  }

  @RequirePermission('analytics', PermissionAction.CREATE)
  @Post('forecast/:type')
  generateForecast(@Param('type') type: ForecastType, @Req() req: AuthedRequest) {
    void type;
    return this.forecasts.generateSalesForecast(req.user.companyId, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('analytics', PermissionAction.VIEW)
  @Get('insights')
  listInsights(@Req() req: AuthedRequest) {
    return this.insights.listInsights(req.user.companyId);
  }

  @RequirePermission('analytics', PermissionAction.CREATE)
  @Post('insights')
  generateInsight(@Req() req: AuthedRequest) {
    return this.insights.generateBusinessBriefing(req.user.companyId, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('analytics', PermissionAction.VIEW)
  @Get('reports')
  listReports(@Req() req: AuthedRequest) {
    return this.reports.listReports(req.user.companyId);
  }

  @RequirePermission('analytics', PermissionAction.CREATE)
  @Post('reports')
  generateReport(@Body() dto: GenerateReportDto, @Req() req: AuthedRequest) {
    return this.reports.generateReport(
      req.user.companyId,
      dto.type as ReportType,
      dto.format,
      req.user.sub,
    );
  }

  @RequirePermission('analytics', PermissionAction.VIEW)
  @Get('schedules')
  listSchedules(@Req() req: AuthedRequest) {
    return this.reports.listSchedules(req.user.companyId);
  }

  @RequirePermission('analytics', PermissionAction.MANAGE_SETTINGS)
  @Post('schedules')
  createSchedule(@Body() dto: CreateScheduleDto, @Req() req: AuthedRequest) {
    return this.reports.createSchedule({
      companyId: req.user.companyId,
      reportType: dto.reportType as ReportType,
      format: dto.format,
      frequency: dto.frequency,
      recipientEmails: dto.recipientEmails,
      createdByUserId: req.user.sub,
    });
  }

  @RequirePermission('analytics', PermissionAction.MANAGE_SETTINGS)
  @Post('schedules/:id/pause')
  pauseSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.setScheduleActive(id, false);
  }

  @RequirePermission('analytics', PermissionAction.MANAGE_SETTINGS)
  @Post('schedules/:id/resume')
  resumeSchedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.setScheduleActive(id, true);
  }
}
