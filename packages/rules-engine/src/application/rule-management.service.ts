import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import type { ConditionNode } from '@platform/permissions';
import { RuleRepository } from '../infrastructure/rule.repository';
import { RuleConflictResolver } from './rule-conflict-resolver';
import type { RuleActionDef } from '../domain/rule-types';

export interface CreateRuleInput {
  companyId: string;
  name: string;
  module: string;
  priority?: number;
  description?: string;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  condition: ConditionNode;
  actions: RuleActionDef[];
  actorUserId?: string;
}

/**
 * Rule CRUD + version history + publish/draft state machine + publish-time conflict
 * detection. Publishing a rule creates a new RuleVersion (status PUBLISHED) and demotes any
 * previously-published version of the same Rule to ARCHIVED, so only one published version
 * is ever active per rule at a time.
 */
export class RuleManagementService {
  constructor(
    private readonly prisma: TenantScopedPrismaClient = getPrismaClient(),
    private readonly repository: RuleRepository = new RuleRepository(prisma),
  ) {}

  async create(input: CreateRuleInput) {
    const rule = await this.prisma.rule.create({
      data: {
        companyId: input.companyId,
        name: input.name,
        module: input.module,
        priority: input.priority ?? 0,
        description: input.description,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        status: 'DRAFT',
        versions: {
          create: {
            version: 1,
            status: 'DRAFT',
            condition: input.condition as object,
            action: input.actions as unknown as object,
            actions: {
              create: input.actions.map((a, i) => ({
                type: a.type,
                params: a.params as object,
                order: a.order ?? i,
              })),
            },
            conditions: { create: flattenConditionForIndexing(input.condition) },
          },
        },
      },
      include: { versions: true },
    });
    await this.audit(rule.id, 'CREATED', input.actorUserId, { name: input.name });
    return rule;
  }

  async update(ruleId: string, input: Partial<CreateRuleInput>) {
    const existing = await this.prisma.rule.findUniqueOrThrow({ where: { id: ruleId } });
    const updated = await this.prisma.rule.update({
      where: { id: ruleId },
      data: {
        name: input.name,
        priority: input.priority,
        description: input.description,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
      },
    });

    if (input.condition || input.actions) {
      const latest = await this.prisma.ruleVersion.findFirst({
        where: { ruleId },
        orderBy: { version: 'desc' },
      });
      const nextVersion = (latest?.version ?? 0) + 1;
      await this.prisma.ruleVersion.create({
        data: {
          ruleId,
          version: nextVersion,
          status: 'DRAFT',
          condition: (input.condition ?? {}) as object,
          action: (input.actions ?? []) as unknown as object,
          actions: {
            create: (input.actions ?? []).map((a, i) => ({
              type: a.type,
              params: a.params as object,
              order: a.order ?? i,
            })),
          },
          conditions: {
            create: flattenConditionForIndexing(input.condition ?? ({} as ConditionNode)),
          },
        },
      });
    }
    await this.audit(ruleId, 'UPDATED', input.actorUserId, { existingStatus: existing.status });
    return updated;
  }

  async delete(ruleId: string, actorUserId?: string) {
    await this.prisma.rule.delete({ where: { id: ruleId } });
    await this.audit(ruleId, 'DELETED', actorUserId, {});
  }

  /**
   * Publishes the latest draft version, demotes any prior published version, sets the Rule
   * itself to PUBLISHED, and runs publish-time conflict detection against sibling
   * company+module rules. Conflicts are returned but do NOT block publish (they are
   * warnings surfaced to the caller / queryable via /rules/simulate) — the spec says
   * "flagged", not "rejected".
   */
  async publish(ruleId: string, actorUserId?: string) {
    const rule = await this.prisma.rule.findUniqueOrThrow({
      where: { id: ruleId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    const draft = rule.versions[0];
    if (!draft) throw new Error(`Rule ${ruleId} has no versions to publish.`);

    const [, , publishedRule] = await this.prisma.$transaction([
      this.prisma.ruleVersion.updateMany({
        where: { ruleId, status: 'PUBLISHED' },
        data: { status: 'ARCHIVED' },
      }),
      this.prisma.ruleVersion.update({
        where: { id: draft.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      }),
      this.prisma.rule.update({ where: { id: ruleId }, data: { status: 'PUBLISHED' } }),
    ]);

    const siblings = await this.repository.loadApplicable(rule.companyId, rule.module);
    const conflicts = RuleConflictResolver.detectConflicts(siblings);
    await this.audit(ruleId, 'PUBLISHED', actorUserId, { conflicts });
    return { rule: publishedRule, conflicts };
  }

  private async audit(
    ruleId: string,
    action: string,
    actorUserId: string | undefined,
    detail: Record<string, unknown>,
  ) {
    await this.prisma.ruleAudit.create({
      data: { ruleId, action, actorUserId, detail: detail as object },
    });
  }
}

function flattenConditionForIndexing(
  node: ConditionNode,
): Array<{ field: string; operator: string; value: object }> {
  const out: Array<{ field: string; operator: string; value: object }> = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const obj = n as Record<string, unknown>;
    for (const op of ['==', '!=', '>', '>=', '<', '<=']) {
      if (op in obj && Array.isArray(obj[op])) {
        const [left, right] = obj[op] as [unknown, unknown];
        if (left && typeof left === 'object' && 'var' in (left as object)) {
          out.push({ field: (left as { var: string }).var, operator: op, value: { value: right } });
        }
      }
    }
    if ('and' in obj && Array.isArray(obj.and)) obj.and.forEach(visit);
    if ('or' in obj && Array.isArray(obj.or)) obj.or.forEach(visit);
    if ('not' in obj) visit(obj.not);
  };
  visit(node);
  return out;
}
