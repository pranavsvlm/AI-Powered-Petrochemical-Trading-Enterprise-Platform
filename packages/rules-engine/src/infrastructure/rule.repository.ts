import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import type { ConditionNode } from '@platform/permissions';
import type { RuleActionDef } from '../domain/rule-types';
import type { RuleWithMeta } from '../application/rule-conflict-resolver';

/**
 * Loads the currently-PUBLISHED version of each PUBLISHED, effective-date-applicable Rule
 * for a company+module, adapted into the RuleWithMeta shape the evaluation engine works
 * with. Draft/published state machine: a Rule has many RuleVersions; only one is ever
 * status=PUBLISHED at a time (enforced by RuleManagementService.publish()).
 */
export class RuleRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient = getPrismaClient()) {}

  async loadApplicable(
    companyId: string,
    module: string,
    at: Date = new Date(),
  ): Promise<RuleWithMeta[]> {
    const rules = await this.prisma.rule.findMany({
      where: {
        companyId,
        module,
        status: 'PUBLISHED',
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: at } }] },
        ],
      },
      include: {
        versions: { where: { status: 'PUBLISHED' }, include: { actions: true, conditions: true } },
      },
    });

    const out: RuleWithMeta[] = [];
    for (const rule of rules) {
      const version = rule.versions[0];
      if (!version) continue;
      out.push({
        ruleId: rule.id,
        companyId: rule.companyId,
        module: rule.module,
        priority: rule.priority,
        condition: version.condition as unknown as ConditionNode,
        actions: version.actions
          .sort((a, b) => a.order - b.order)
          .map((a): RuleActionDef => ({
            type: a.type as RuleActionDef['type'],
            params: a.params as Record<string, unknown>,
            order: a.order,
          })),
        updatedAt: rule.updatedAt,
      });
    }
    return out;
  }

  async listByCompany(companyId: string, module?: string) {
    return this.prisma.rule.findMany({ where: { companyId, module }, include: { versions: true } });
  }

  async findById(id: string) {
    return this.prisma.rule.findUnique({
      where: { id },
      include: { versions: { include: { actions: true, conditions: true } } },
    });
  }
}
