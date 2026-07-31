import type {
  TenantScopedPrismaClient,
  AiProviderConfig,
  AiProviderKind,
} from '@platform/database';

export interface UpsertAiProviderConfigInput {
  enabled?: boolean;
  isDefault?: boolean;
  priority?: number;
  baseUrl?: string;
  defaultChatModel?: string;
  defaultEmbedModel?: string;
  apiKeyRef?: string;
  monthlyCostCeilingUsd?: number;
}

export class AiProviderConfigRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  listEnabled(companyId: string): Promise<AiProviderConfig[]> {
    return this.prisma.aiProviderConfig.findMany({
      where: { companyId, enabled: true },
      orderBy: { priority: 'asc' },
    });
  }

  list(companyId: string): Promise<AiProviderConfig[]> {
    return this.prisma.aiProviderConfig.findMany({
      where: { companyId },
      orderBy: { priority: 'asc' },
    });
  }

  findByProvider(companyId: string, provider: AiProviderKind): Promise<AiProviderConfig | null> {
    return this.prisma.aiProviderConfig.findUnique({
      where: { companyId_provider: { companyId, provider } },
    });
  }

  /** `companyId`/`provider` are real, non-nullable columns here (unlike PromptTemplate/Memory's nullable-scope compound keys), so Prisma's native upsert is safe. */
  upsert(
    companyId: string,
    provider: AiProviderKind,
    data: UpsertAiProviderConfigInput,
  ): Promise<AiProviderConfig> {
    return this.prisma.aiProviderConfig.upsert({
      where: { companyId_provider: { companyId, provider } },
      create: { companyId, provider, ...data },
      update: data,
    });
  }
}
