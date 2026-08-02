import type { TenantScopedPrismaClient, ApiKey } from '@platform/database';

export interface CreateApiKeyInput {
  companyId: string;
  userId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
}

export class ApiKeyRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  create(input: CreateApiKeyInput): Promise<ApiKey> {
    return this.db.apiKey.create({ data: input });
  }

  list(companyId: string): Promise<ApiKey[]> {
    return this.db.apiKey.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  findById(id: string): Promise<ApiKey | null> {
    return this.db.apiKey.findUnique({ where: { id } });
  }

  revoke(id: string): Promise<ApiKey> {
    return this.db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }
}
