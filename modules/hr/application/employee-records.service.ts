import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type {
  TenantScopedPrismaClient,
  PayrollProfile,
  PerformanceReview,
  TrainingRecord,
  EmployeeAsset,
} from '@platform/database';
import {
  EmployeeRecordsRepository,
  type CreateEmployeeAssetInput,
  type CreatePerformanceReviewInput,
  type CreateTrainingRecordInput,
  type UpsertPayrollProfileInput,
} from '../infrastructure/employee-records.repository';
import type { HrAuditWriter } from './ports';

/**
 * Payroll/Performance/Training/Assets — bundled the same way the repository layer already is
 * (see infrastructure/employee-records.repository.ts's doc comment). Payroll is deliberately
 * "architecture ready" only (doc 15's own framing): a real salary-structure row, no payroll-run
 * computation, no payslip generation.
 */
@Injectable()
export class EmployeeRecordsService {
  private readonly repo: EmployeeRecordsRepository;

  constructor(
    db: TenantScopedPrismaClient,
    private readonly audit: HrAuditWriter,
  ) {
    this.repo = new EmployeeRecordsRepository(db);
  }

  async setPayrollProfile(
    input: UpsertPayrollProfileInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PayrollProfile> {
    const profile = await this.repo.upsertPayrollProfile(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.PAYROLL_PROFILE_UPDATED,
      entityType: 'PayrollProfile',
      entityId: profile.id,
      after: { baseSalary: input.baseSalary, currency: input.currency },
      ipAddress: ipAddress ?? null,
    });
    return profile;
  }

  async getPayrollProfile(employeeId: string): Promise<PayrollProfile> {
    const profile = await this.repo.getPayrollProfile(employeeId);
    if (!profile) throw new NotFoundException('No payroll profile set for this employee.');
    return profile;
  }

  async addPerformanceReview(
    input: CreatePerformanceReviewInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PerformanceReview> {
    const review = await this.repo.createPerformanceReview(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.PERFORMANCE_REVIEW_COMPLETED,
      entityType: 'PerformanceReview',
      entityId: review.id,
      after: { period: input.period, rating: input.rating },
      ipAddress: ipAddress ?? null,
    });
    return review;
  }

  listPerformanceReviews(companyId: string, employeeId: string): Promise<PerformanceReview[]> {
    return this.repo.listPerformanceReviews(companyId, employeeId);
  }

  async addTrainingRecord(
    input: CreateTrainingRecordInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<TrainingRecord> {
    const record = await this.repo.createTrainingRecord(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.TRAINING_RECORDED,
      entityType: 'TrainingRecord',
      entityId: record.id,
      after: { courseName: input.courseName },
      ipAddress: ipAddress ?? null,
    });
    return record;
  }

  listTrainingRecords(companyId: string, employeeId: string): Promise<TrainingRecord[]> {
    return this.repo.listTrainingRecords(companyId, employeeId);
  }

  async assignAsset(
    input: CreateEmployeeAssetInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<EmployeeAsset> {
    const asset = await this.repo.createEmployeeAsset(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.ASSET_ASSIGNED,
      entityType: 'EmployeeAsset',
      entityId: asset.id,
      after: { assetType: input.assetType },
      ipAddress: ipAddress ?? null,
    });
    return asset;
  }

  async returnAsset(
    id: string,
    companyId: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<EmployeeAsset> {
    const asset = await this.repo.returnEmployeeAsset(id);
    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.ASSET_RETURNED,
      entityType: 'EmployeeAsset',
      entityId: id,
      ipAddress: ipAddress ?? null,
    });
    return asset;
  }

  listAssets(companyId: string, employeeId: string): Promise<EmployeeAsset[]> {
    return this.repo.listEmployeeAssets(companyId, employeeId);
  }
}
