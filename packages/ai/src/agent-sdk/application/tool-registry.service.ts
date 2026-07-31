import type { TenantScopedPrismaClient, Tool, Prisma } from '@platform/database';
import type { ToolDefinition } from '../domain/agent-types';

/** Mirrors packages/ai's static TOOL_DEFINITIONS into the `tools` table at boot — see AgentRegistryService's doc comment for why this is safe outside a tenant context. */
export class ToolRegistryService {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  async sync(definitions: ToolDefinition[]): Promise<void> {
    for (const def of definitions) {
      await this.prisma.tool.upsert({
        where: { key: def.key },
        create: {
          key: def.key,
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema as Prisma.InputJsonValue,
          requiredPermissionModule: def.requiredPermissionModule,
          requiredPermissionAction: def.requiredPermissionAction,
          requiresHumanApproval: def.requiresHumanApproval,
          isBuiltIn: true,
        },
        update: {
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema as Prisma.InputJsonValue,
          requiredPermissionModule: def.requiredPermissionModule,
          requiredPermissionAction: def.requiredPermissionAction,
          requiresHumanApproval: def.requiresHumanApproval,
        },
      });
    }
  }

  findByKey(key: string): Promise<Tool | null> {
    return this.prisma.tool.findUnique({ where: { key } });
  }

  findManyByKeys(keys: string[]): Promise<Tool[]> {
    return this.prisma.tool.findMany({ where: { key: { in: keys } } });
  }
}
