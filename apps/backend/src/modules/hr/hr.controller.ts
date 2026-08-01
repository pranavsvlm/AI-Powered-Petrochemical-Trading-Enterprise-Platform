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
import {
  EmployeeService,
  AttendanceService,
  LeaveService,
  EmployeeRecordsService,
} from '@modules/hr';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  ClockInDto,
  ClockOutDto,
  CreateEmployeeAssetDto,
  CreateEmployeeDto,
  CreateLeavePolicyDto,
  CreatePerformanceReviewDto,
  CreateShiftDto,
  CreateTrainingRecordDto,
  DecideLeaveDto,
  RequestLeaveDto,
  SetPayrollProfileDto,
  UpdateEmployeeDto,
} from './dto/hr.dto';

type AuthedRequest = Request & { user: JwtAccessTokenPayload };

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeeService) {}

  @RequirePermission('hr', PermissionAction.CREATE)
  @Post()
  create(@Body() dto: CreateEmployeeDto, @Req() req: AuthedRequest) {
    return this.employees.create(
      {
        companyId: req.user.companyId,
        userId: dto.userId,
        employeeNumber: dto.employeeNumber,
        departmentId: dto.departmentId,
        teamId: dto.teamId,
        branchId: dto.branchId,
        managerId: dto.managerId,
        jobTitle: dto.jobTitle,
        employmentType: dto.employmentType,
        hireDate: new Date(dto.hireDate),
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get()
  list(@Req() req: AuthedRequest, @Query('departmentId') departmentId?: string) {
    return this.employees.list(req.user.companyId, departmentId);
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get(':id')
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.getById(id);
  }

  @RequirePermission('hr', PermissionAction.EDIT)
  @Put(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: AuthedRequest,
  ) {
    return this.employees.update(
      id,
      {
        ...dto,
        terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : undefined,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get(':id/reports')
  listDirectReports(@Param('id', ParseUUIDPipe) id: string) {
    return this.employees.listDirectReports(id);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @RequirePermission('hr', PermissionAction.CREATE)
  @Post('attendance')
  clockIn(@Body() dto: ClockInDto, @Req() req: AuthedRequest) {
    return this.attendance.clockIn(req.user.companyId, dto.employeeId);
  }

  @RequirePermission('hr', PermissionAction.EDIT)
  @Post('attendance/:id/clock-out')
  clockOut(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ClockOutDto,
    @Req() req: AuthedRequest,
  ) {
    return this.attendance.clockOut(id, req.user.sub, dto.shiftHours, req.ip ?? null);
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('attendance')
  list(@Req() req: AuthedRequest, @Query('employeeId') employeeId?: string) {
    return this.attendance.list(req.user.companyId, employeeId);
  }

  @RequirePermission('hr', PermissionAction.CREATE)
  @Post('shifts')
  createShift(@Body() dto: CreateShiftDto, @Req() req: AuthedRequest) {
    return this.attendance.createShift({ companyId: req.user.companyId, ...dto });
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('shifts')
  listShifts(@Req() req: AuthedRequest) {
    return this.attendance.listShifts(req.user.companyId);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @RequirePermission('hr', PermissionAction.CREATE)
  @Post('leave-policies')
  createPolicy(@Body() dto: CreateLeavePolicyDto, @Req() req: AuthedRequest) {
    return this.leave.createPolicy({ companyId: req.user.companyId, ...dto });
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('leave-policies')
  listPolicies(@Req() req: AuthedRequest) {
    return this.leave.listPolicies(req.user.companyId);
  }

  @RequirePermission('hr', PermissionAction.CREATE)
  @Post('leave')
  requestLeave(@Body() dto: RequestLeaveDto, @Req() req: AuthedRequest) {
    return this.leave.requestLeave(
      {
        companyId: req.user.companyId,
        employeeId: dto.employeeId,
        policyId: dto.policyId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        reason: dto.reason,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('leave')
  list(@Req() req: AuthedRequest, @Query('employeeId') employeeId?: string) {
    return this.leave.list(req.user.companyId, employeeId);
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('leave/balance')
  getBalance(@Query('employeeId') employeeId: string, @Query('policyId') policyId: string) {
    return this.leave.getBalance(employeeId, policyId).then((balance) => ({ balance }));
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('leave/:id/approvals')
  listPendingApprovals(@Param('id', ParseUUIDPipe) id: string) {
    return this.leave.listPendingApprovals(id);
  }

  @RequirePermission('hr', PermissionAction.APPROVE)
  @Post('leave/approvals/:approvalId/decide')
  decide(
    @Param('approvalId', ParseUUIDPipe) approvalId: string,
    @Body() dto: DecideLeaveDto,
    @Req() req: AuthedRequest,
  ) {
    return this.leave.decide(approvalId, dto.decision, req.user.sub, dto.comment, req.ip ?? null);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class EmployeeRecordsController {
  constructor(private readonly records: EmployeeRecordsService) {}

  @RequirePermission('hr', PermissionAction.MANAGE_SETTINGS)
  @Post('payroll-profiles')
  setPayrollProfile(@Body() dto: SetPayrollProfileDto, @Req() req: AuthedRequest) {
    return this.records.setPayrollProfile(
      {
        companyId: req.user.companyId,
        employeeId: dto.employeeId,
        baseSalary: dto.baseSalary,
        currency: dto.currency,
        allowances: dto.allowances,
        deductions: dto.deductions,
        effectiveFrom: new Date(dto.effectiveFrom),
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('payroll-profiles/:employeeId')
  getPayrollProfile(@Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.records.getPayrollProfile(employeeId);
  }

  @RequirePermission('hr', PermissionAction.CREATE)
  @Post('performance-reviews')
  addPerformanceReview(@Body() dto: CreatePerformanceReviewDto, @Req() req: AuthedRequest) {
    return this.records.addPerformanceReview(
      {
        companyId: req.user.companyId,
        employeeId: dto.employeeId,
        reviewerUserId: req.user.sub,
        period: dto.period,
        rating: dto.rating,
        goals: dto.goals,
        feedback: dto.feedback,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('performance-reviews/:employeeId')
  listPerformanceReviews(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.records.listPerformanceReviews(req.user.companyId, employeeId);
  }

  @RequirePermission('hr', PermissionAction.CREATE)
  @Post('training-records')
  addTrainingRecord(@Body() dto: CreateTrainingRecordDto, @Req() req: AuthedRequest) {
    return this.records.addTrainingRecord(
      {
        companyId: req.user.companyId,
        employeeId: dto.employeeId,
        courseName: dto.courseName,
        certificationName: dto.certificationName,
        completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('training-records/:employeeId')
  listTrainingRecords(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.records.listTrainingRecords(req.user.companyId, employeeId);
  }

  @RequirePermission('hr', PermissionAction.CREATE)
  @Post('employee-assets')
  assignAsset(@Body() dto: CreateEmployeeAssetDto, @Req() req: AuthedRequest) {
    return this.records.assignAsset(
      { companyId: req.user.companyId, ...dto },
      req.user.sub,
      req.ip ?? null,
    );
  }

  @RequirePermission('hr', PermissionAction.EDIT)
  @Post('employee-assets/:id/return')
  returnAsset(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.records.returnAsset(id, req.user.companyId, req.user.sub, req.ip ?? null);
  }

  @RequirePermission('hr', PermissionAction.VIEW)
  @Get('employee-assets/:employeeId')
  listAssets(@Param('employeeId', ParseUUIDPipe) employeeId: string, @Req() req: AuthedRequest) {
    return this.records.listAssets(req.user.companyId, employeeId);
  }
}
