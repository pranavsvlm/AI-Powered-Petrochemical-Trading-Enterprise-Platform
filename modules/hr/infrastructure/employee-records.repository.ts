import type {
  TenantScopedPrismaClient,
  PayrollProfile,
  PerformanceReview,
  TrainingRecord,
  EmployeeAsset,
} from '@platform/database';

export interface UpsertPayrollProfileInput {
  companyId: string;
  employeeId: string;
  baseSalary: number;
  currency: string;
  allowances?: Record<string, number>;
  deductions?: Record<string, number>;
  effectiveFrom: Date;
}

export interface CreatePerformanceReviewInput {
  companyId: string;
  employeeId: string;
  reviewerUserId: string;
  period: string;
  rating?: number;
  goals?: Record<string, unknown>;
  feedback?: string;
  completedAt?: Date;
}

export interface CreateTrainingRecordInput {
  companyId: string;
  employeeId: string;
  courseName: string;
  certificationName?: string;
  completedAt?: Date;
  expiresAt?: Date;
}

export interface CreateEmployeeAssetInput {
  companyId: string;
  employeeId: string;
  assetType: string;
  description?: string;
}

/**
 * Payroll/Performance/Training/Assets bundled into one repository — each is a simple record type
 * attached to Employee with no cross-cutting business logic of its own, same reasoning
 * ProductService already established for bundling its own category/attribute/pricing
 * sub-concerns rather than one class per table.
 */
export class EmployeeRecordsRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  upsertPayrollProfile(input: UpsertPayrollProfileInput): Promise<PayrollProfile> {
    const { employeeId, ...rest } = input;
    return this.db.payrollProfile.upsert({
      where: { employeeId },
      create: input,
      update: rest,
    });
  }

  getPayrollProfile(employeeId: string): Promise<PayrollProfile | null> {
    return this.db.payrollProfile.findUnique({ where: { employeeId } });
  }

  createPerformanceReview(input: CreatePerformanceReviewInput): Promise<PerformanceReview> {
    return this.db.performanceReview.create({ data: input });
  }

  listPerformanceReviews(companyId: string, employeeId: string): Promise<PerformanceReview[]> {
    return this.db.performanceReview.findMany({
      where: { companyId, employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createTrainingRecord(input: CreateTrainingRecordInput): Promise<TrainingRecord> {
    return this.db.trainingRecord.create({ data: input });
  }

  listTrainingRecords(companyId: string, employeeId: string): Promise<TrainingRecord[]> {
    return this.db.trainingRecord.findMany({
      where: { companyId, employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  createEmployeeAsset(input: CreateEmployeeAssetInput): Promise<EmployeeAsset> {
    return this.db.employeeAsset.create({ data: input });
  }

  returnEmployeeAsset(id: string): Promise<EmployeeAsset> {
    return this.db.employeeAsset.update({ where: { id }, data: { returnedAt: new Date() } });
  }

  listEmployeeAssets(companyId: string, employeeId: string): Promise<EmployeeAsset[]> {
    return this.db.employeeAsset.findMany({
      where: { companyId, employeeId },
      orderBy: { assignedAt: 'desc' },
    });
  }
}
