import type {
  TenantScopedPrismaClient,
  PromptTemplate,
  PromptTemplateVersion,
} from '@platform/database';
import { withoutTenantScope } from '@platform/database';

export type PromptTemplateWithLatestVersion = PromptTemplate & {
  versions: PromptTemplateVersion[];
};

const LATEST_PUBLISHED_VERSION_INCLUDE = {
  versions: {
    where: { publishedAt: { not: null } },
    orderBy: { version: 'desc' as const },
    take: 1,
  },
};

export class PromptTemplateRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  /** Tenant-scoped lookup — the ambient tenant context injects `companyId` automatically. */
  findActiveByKey(key: string): Promise<PromptTemplateWithLatestVersion | null> {
    return this.prisma.promptTemplate.findFirst({
      where: { key, isActive: true },
      include: LATEST_PUBLISHED_VERSION_INCLUDE,
    });
  }

  /**
   * The platform-wide default (companyId: null) a company falls back to when it has no
   * override of its own. Reads via `withoutTenantScope` since `companyId: null` rows would
   * otherwise be invisible to (and filtered out by) the tenant-scoping extension.
   */
  async findPlatformDefaultByKey(key: string): Promise<PromptTemplateWithLatestVersion | null> {
    return withoutTenantScope(async () =>
      this.prisma.promptTemplate.findFirst({
        where: { companyId: null, key, isActive: true },
        include: LATEST_PUBLISHED_VERSION_INCLUDE,
      }),
    );
  }

  /**
   * Publishes a new version of a company's own template, creating the parent `PromptTemplate`
   * row on first use. Runs under the ambient tenant context — `companyId` is auto-injected by
   * the tenant extension on `create`, exactly like any other tenant-scoped aggregate. Never
   * used for platform-default (companyId: null) rows — those are seeded separately via a raw,
   * un-extended `PrismaClient` (see packages/database/prisma/seed.ts), never through this
   * tenant-scoped client.
   */
  async publish(key: string, content: string): Promise<PromptTemplateWithLatestVersion> {
    const existing = await this.prisma.promptTemplate.findFirst({
      where: { key },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });

    const template =
      existing ??
      (await this.prisma.promptTemplate.create({
        data: { key, isActive: true },
        include: { versions: true },
      }));

    const nextVersion = (existing?.versions[0]?.version ?? 0) + 1;
    await this.prisma.promptTemplateVersion.create({
      data: {
        promptTemplateId: template.id,
        version: nextVersion,
        content,
        publishedAt: new Date(),
      },
    });

    return this.findActiveByKey(key) as Promise<PromptTemplateWithLatestVersion>;
  }
}
