import type { TenantScopedPrismaClient, Agent, Prisma } from '@platform/database';
import type { AgentDefinition } from '../domain/agent-types';

/**
 * Mirrors packages/ai's static AGENT_DEFINITIONS into the `agents` table at boot. `Agent` is
 * NOT tenant-scoped (a global, code-defined catalog — see docs/DOMAIN_MODEL_PHASE6.md §4), so
 * `sync()` can run outside any per-request tenant context; the tenant extension bypasses
 * non-tenant-scoped models entirely regardless of what client instance is used.
 */
export class AgentRegistryService {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  async sync(definitions: AgentDefinition[]): Promise<void> {
    for (const def of definitions) {
      await this.prisma.agent.upsert({
        where: { key: def.key },
        create: {
          key: def.key,
          name: def.name,
          description: def.description,
          version: def.version,
          capabilities: def.capabilities as Prisma.InputJsonValue,
          systemPromptTemplateKey: def.systemPromptTemplateKey,
          isBuiltIn: true,
        },
        update: {
          name: def.name,
          description: def.description,
          version: def.version,
          capabilities: def.capabilities as Prisma.InputJsonValue,
          systemPromptTemplateKey: def.systemPromptTemplateKey,
        },
      });
    }
  }

  findByKey(key: string): Promise<Agent | null> {
    return this.prisma.agent.findUnique({ where: { key } });
  }

  list(): Promise<Agent[]> {
    return this.prisma.agent.findMany({ orderBy: { name: 'asc' } });
  }
}
