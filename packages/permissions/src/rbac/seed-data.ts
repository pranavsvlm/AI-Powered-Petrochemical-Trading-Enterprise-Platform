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

export const SEED_PERMISSIONS = PHASE1_MODULES.flatMap((module) =>
  Object.values(PermissionAction).map((action) => ({
    code: `${module}:${action.toLowerCase()}`,
    module,
    action,
  })),
);
