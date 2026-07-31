import type { TenantScopedPrismaClient, Memory, MemoryScopeType, Prisma } from '@platform/database';

export interface UpsertMemoryInput {
  companyId: string;
  scopeType: MemoryScopeType;
  scopeId?: string | null;
  key: string;
  value: unknown;
  sourceAgentKey?: string;
  confidence?: number;
  expiresAt?: Date;
}

/**
 * Company-isolated durable memory (doc 05/26: "never share memory between companies") — the
 * ambient tenant context (via TenantScopedPrismaClient) auto-scopes every query by companyId,
 * same as every other tenant-scoped repository in this codebase.
 *
 * Uses a manual find-then-create-or-update rather than Prisma's `.upsert()` on the
 * `[companyId, scopeType, scopeId, key]` compound unique — Postgres treats NULL != NULL in
 * unique indexes, so that constraint does not actually block duplicate COMPANY-scope rows
 * (scopeId: null) at the DB level; this sidesteps relying on it. Same caveat and same fix as
 * PromptTemplateRepository.publish().
 */
export class MemoryRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  async upsert(input: UpsertMemoryInput): Promise<Memory> {
    const existing = await this.prisma.memory.findFirst({
      where: { scopeType: input.scopeType, scopeId: input.scopeId ?? null, key: input.key },
    });

    if (existing) {
      return this.prisma.memory.update({
        where: { id: existing.id },
        data: {
          value: input.value as Prisma.InputJsonValue,
          sourceAgentKey: input.sourceAgentKey,
          confidence: input.confidence,
          expiresAt: input.expiresAt,
        },
      });
    }

    return this.prisma.memory.create({
      data: {
        companyId: input.companyId,
        scopeType: input.scopeType,
        scopeId: input.scopeId ?? undefined,
        key: input.key,
        value: input.value as Prisma.InputJsonValue,
        sourceAgentKey: input.sourceAgentKey,
        confidence: input.confidence,
        expiresAt: input.expiresAt,
      },
    });
  }

  get(scopeType: MemoryScopeType, scopeId: string | null, key: string): Promise<Memory | null> {
    return this.prisma.memory.findFirst({ where: { scopeType, scopeId: scopeId ?? null, key } });
  }

  list(scopeType: MemoryScopeType, scopeId?: string | null): Promise<Memory[]> {
    return this.prisma.memory.findMany({
      where: { scopeType, scopeId: scopeId === undefined ? undefined : (scopeId ?? null) },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
