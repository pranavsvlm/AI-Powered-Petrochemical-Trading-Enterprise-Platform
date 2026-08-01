import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;
const EMPLOYMENT_STATUSES = ['ACTIVE', 'ON_LEAVE', 'TERMINATED'] as const;
const LEAVE_TYPES = ['ANNUAL', 'SICK', 'UNPAID', 'CUSTOM'] as const;

export class CreateEmployeeDto {
  @IsString() @IsNotEmpty() userId!: string;
  @IsString() @IsNotEmpty() employeeNumber!: string;
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() managerId?: string;
  @IsString() @IsNotEmpty() jobTitle!: string;
  @IsIn(EMPLOYMENT_TYPES) employmentType!: (typeof EMPLOYMENT_TYPES)[number];
  @IsDateString() hireDate!: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
}

export class UpdateEmployeeDto {
  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsString() jobTitle?: string;
  @IsOptional() @IsIn(EMPLOYMENT_TYPES) employmentType?: (typeof EMPLOYMENT_TYPES)[number];
  @IsOptional() @IsIn(EMPLOYMENT_STATUSES) employmentStatus?: (typeof EMPLOYMENT_STATUSES)[number];
  @IsOptional() @IsDateString() terminationDate?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
}

export class CreateShiftDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() startTime!: string;
  @IsString() @IsNotEmpty() endTime!: string;
}

export class ClockInDto {
  @IsString() @IsNotEmpty() employeeId!: string;
}

export class ClockOutDto {
  @IsOptional() @IsNumber() shiftHours?: number;
}

export class CreateLeavePolicyDto {
  @IsIn(LEAVE_TYPES) type!: (typeof LEAVE_TYPES)[number];
  @IsString() @IsNotEmpty() name!: string;
  @IsInt() @Min(0) daysPerYear!: number;
}

export class RequestLeaveDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty() policyId!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsOptional() @IsString() reason?: string;
}

export class DecideLeaveDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() comment?: string;
}

export class SetPayrollProfileDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsNumber() baseSalary!: number;
  @IsString() @IsNotEmpty() currency!: string;
  @IsOptional() @IsObject() allowances?: Record<string, number>;
  @IsOptional() @IsObject() deductions?: Record<string, number>;
  @IsDateString() effectiveFrom!: string;
}

export class CreatePerformanceReviewDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty() period!: string;
  @IsOptional() @IsInt() @Min(1) @Max(5) rating?: number;
  @IsOptional() @IsObject() goals?: Record<string, unknown>;
  @IsOptional() @IsString() feedback?: string;
  @IsOptional() @IsDateString() completedAt?: string;
}

export class CreateTrainingRecordDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty() courseName!: string;
  @IsOptional() @IsString() certificationName?: string;
  @IsOptional() @IsDateString() completedAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreateEmployeeAssetDto {
  @IsString() @IsNotEmpty() employeeId!: string;
  @IsString() @IsNotEmpty() assetType!: string;
  @IsOptional() @IsString() description?: string;
}
