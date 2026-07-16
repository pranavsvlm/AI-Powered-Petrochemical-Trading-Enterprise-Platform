import { PermissionAction } from '@platform/types';

/** Platform-level roles (company_id = null) and company-seedable roles, per doc 07. */
export const SYSTEM_ROLES = {
  platform: ['PLATFORM_SUPER_ADMIN', 'PLATFORM_ADMINISTRATOR'] as const,
  company: [
    'COMPANY_ADMIN',
    'FINANCE_MANAGER',
    'SALES_MANAGER',
    'HR_MANAGER',
    'INVENTORY_MANAGER',
    'PROCUREMENT_MANAGER',
    'OPERATIONS_MANAGER',
    'EMPLOYEE',
    'VIEWER',
  ] as const,
};

/** Modules whose permissions are seeded for Phase 1's own surface area. */
const PHASE1_MODULES = [
  'company',
  'users',
  'departments',
  'teams',
  'roles',
  'policies',
  'approval-rules',
];

/**
 * Modules whose permissions are seeded for Phase 2's platform-backbone surface area (Event
 * Bus, Business Rules Engine, Workflow Engine, Notification Center). The REST controllers
 * in apps/backend/src/modules/{events,rules,workflows,notifications} gate their routes on
 * these module/action pairs using the existing PermissionAction enum (VIEW/CREATE/EDIT/
 * DELETE/MANAGE_SETTINGS/EXECUTE_AI) rather than adding doc-specific action names (e.g.
 * "Replay Events", "Manage Subscribers") — see the permission-gating note in
 * events.controller.ts for the mapping rationale.
 */
const PHASE2_MODULES = ['events', 'rules', 'workflows', 'notifications'];

export const SEED_PERMISSIONS = [...PHASE1_MODULES, ...PHASE2_MODULES].flatMap((module) =>
  Object.values(PermissionAction).map((action) => ({
    code: `${module}:${action.toLowerCase()}`,
    module,
    action,
  })),
);
