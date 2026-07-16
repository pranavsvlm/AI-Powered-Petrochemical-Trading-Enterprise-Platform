export const PACKAGE_NAME = '@platform/permissions';
export { evaluateCondition, ConditionEvaluationError } from './abac/condition-evaluator';
export type { ConditionNode, ConditionExpr } from './abac/condition-evaluator';
export { permissionCode, hasPermission } from './rbac/permission-key';
export type { RequiredPermission } from './rbac/permission-key';
export { SYSTEM_ROLES, SEED_PERMISSIONS } from './rbac/seed-data';
