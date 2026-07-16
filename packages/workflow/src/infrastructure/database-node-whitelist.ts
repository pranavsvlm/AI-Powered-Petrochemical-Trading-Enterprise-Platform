/**
 * docs/DOMAIN_MODEL_PHASE2.md §8: the DATABASE node type may only create/update against
 * these Prisma models — all introduced in Phase 1 or Phase 2. Any other model name is
 * rejected at publish time, since business-module tables don't exist yet.
 */
export const DATABASE_NODE_MODEL_WHITELIST = [
  'department',
  'team',
  'companyFeature',
  'notification',
  'workflowTask',
] as const;

export type DatabaseNodeModel = (typeof DATABASE_NODE_MODEL_WHITELIST)[number];

export function assertWhitelistedModel(model: string): asserts model is DatabaseNodeModel {
  if (!DATABASE_NODE_MODEL_WHITELIST.includes(model as DatabaseNodeModel)) {
    throw new Error(
      `DATABASE node references model "${model}" which is not in the Phase 2 whitelist: ${DATABASE_NODE_MODEL_WHITELIST.join(', ')}.`,
    );
  }
}
