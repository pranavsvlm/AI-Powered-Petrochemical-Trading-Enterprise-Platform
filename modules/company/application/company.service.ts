import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType, TenantContextStore } from '@platform/core';
import { CompanyStatus } from '@platform/types';
import type { Company, CompanyFeature, TenantScopedPrismaClient } from '@platform/database';
import { CompanyRepository, type CreateCompanyInput } from '../infrastructure/company.repository';

export interface CompanyAuditWriter {
  record(entry: {
    companyId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void>;
}

/**
 * Application-layer use cases for the Company aggregate (doc 08). Platform-admin only —
 * authorization is enforced by the caller (apps/backend controller + guards); this service
 * assumes the caller has already validated the actor is a Platform Super Admin / Administrator.
 */
@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);
  private readonly repo: CompanyRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: CompanyAuditWriter,
  ) {
    this.repo = new CompanyRepository(db);
  }

  async create(
    input: CreateCompanyInput,
    actorUserId: string | null,
    ip: string | null,
  ): Promise<Company> {
    const existingCode = await this.repo.findByCode(input.companyCode);
    if (existingCode) {
      throw new ConflictException('company_code must be unique.');
    }
    const company = await this.repo.create(input);
    await this.audit.record({
      companyId: company.id,
      actorUserId,
      eventType: AuditEventType.COMPANY_CREATED,
      entityType: 'Company',
      entityId: company.id,
      after: { companyCode: company.companyCode, legalName: company.legalName },
      ipAddress: ip,
    });
    this.logger.log(`Company created: ${company.id} (${company.companyCode})`);
    return company;
  }

  list(): Promise<Company[]> {
    return this.repo.list();
  }

  async getById(id: string): Promise<Company> {
    const company = await this.repo.findById(id);
    if (!company) throw new NotFoundException('Company not found.');
    return company;
  }

  async update(
    id: string,
    data: Partial<
      Pick<Company, 'legalName' | 'tradeName' | 'country' | 'timezone' | 'currency' | 'status'>
    >,
    actorUserId: string | null,
    ip: string | null,
  ): Promise<Company> {
    const before = await this.getById(id);
    const updated = await this.repo.update(id, data);
    await this.audit.record({
      companyId: id,
      actorUserId,
      eventType: AuditEventType.COMPANY_UPDATED,
      entityType: 'Company',
      entityId: id,
      before: { legalName: before.legalName, status: before.status },
      after: { legalName: updated.legalName, status: updated.status },
      ipAddress: ip,
    });
    return updated;
  }

  async suspend(id: string, actorUserId: string | null, ip: string | null): Promise<Company> {
    const updated = await this.repo.update(id, { status: CompanyStatus.SUSPENDED });
    await this.audit.record({
      companyId: id,
      actorUserId,
      eventType: AuditEventType.COMPANY_SUSPENDED,
      entityType: 'Company',
      entityId: id,
      ipAddress: ip,
    });
    return updated;
  }

  async activate(id: string, actorUserId: string | null, ip: string | null): Promise<Company> {
    const updated = await this.repo.update(id, { status: CompanyStatus.ACTIVE });
    await this.audit.record({
      companyId: id,
      actorUserId,
      eventType: AuditEventType.COMPANY_UPDATED,
      entityType: 'Company',
      entityId: id,
      after: { status: CompanyStatus.ACTIVE },
      ipAddress: ip,
    });
    return updated;
  }

  async listFeatures(companyId: string): Promise<CompanyFeature[]> {
    await this.getById(companyId);
    return TenantContextStore.run(
      { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
      async () => await this.repo.listFeatures(companyId),
    );
  }

  async setFeature(
    companyId: string,
    moduleName: string,
    enabled: boolean,
    actorUserId: string | null,
    ip: string | null,
  ): Promise<CompanyFeature> {
    await this.getById(companyId);
    const feature = await TenantContextStore.run(
      { companyId, userId: null, sessionId: null, ipAddress: ip, isPlatformActor: false },
      async () => await this.repo.setFeature(companyId, moduleName, enabled),
    );
    await this.audit.record({
      companyId,
      actorUserId,
      eventType: enabled ? AuditEventType.FEATURE_ENABLED : AuditEventType.FEATURE_DISABLED,
      entityType: 'CompanyFeature',
      entityId: feature.id,
      after: { moduleName, enabled },
      ipAddress: ip,
    });
    return feature;
  }
}
