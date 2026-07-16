import type { TenantScopedPrismaClient, Company, CompanyFeature } from '@platform/database';

export interface CreateCompanyInput {
  companyCode: string;
  legalName: string;
  tradeName?: string;
  registrationNumber?: string;
  taxNumber?: string;
  country: string;
  timezone: string;
  currency: string;
  language?: string;
}

/**
 * Prisma-backed repository for the Company aggregate. Company create/list/platform-admin
 * operations are intentionally NOT run through the tenant-scoped extension the same way
 * user-scoped models are — a Company row IS the tenant, so it is addressed directly by id
 * and callers (services) are responsible for authorization (platform-admin only).
 */
export class CompanyRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateCompanyInput): Promise<Company> {
    return this.db.company.create({
      data: {
        ...input,
        language: input.language ?? 'en',
        profile: { create: {} },
        settings: { create: { defaultCurrency: input.currency } },
      },
    });
  }

  findById(id: string): Promise<Company | null> {
    return this.db.company.findUnique({ where: { id } });
  }

  findByCode(companyCode: string): Promise<Company | null> {
    return this.db.company.findUnique({ where: { companyCode } });
  }

  list(): Promise<Company[]> {
    return this.db.company.findMany({ orderBy: { createdAt: 'desc' } });
  }

  update(
    id: string,
    data: Partial<Omit<Company, 'id' | 'createdAt' | 'updatedAt'>>,
  ): Promise<Company> {
    return this.db.company.update({ where: { id }, data });
  }

  listFeatures(companyId: string): Promise<CompanyFeature[]> {
    return this.db.companyFeature.findMany({ where: { companyId } });
  }

  setFeature(companyId: string, moduleName: string, enabled: boolean): Promise<CompanyFeature> {
    return this.db.companyFeature.upsert({
      where: { companyId_moduleName: { companyId, moduleName } },
      create: { companyId, moduleName, enabled },
      update: { enabled },
    });
  }
}
