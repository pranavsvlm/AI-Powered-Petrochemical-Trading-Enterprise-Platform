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

/**
 * Phase 3's Document Management surface area (doc 21). `documents.controller.ts` gates its
 * routes on this module using the existing PermissionAction enum, including APPROVE (request-
 * approval / decide-approval) and MANAGE_SETTINGS (folders/categories/tags administration).
 */
const PHASE3_MODULES = ['documents'];

/**
 * Phase 4's Core Trading Domain surface area (docs 11/12/13: Customers, Products, RFQ +
 * Quotation, Orders). Doc-bespoke permission names ("Manage Pricing", "Manage Categories",
 * "AI Customer Analysis", "Use AI Product Expert") map onto the existing PermissionAction enum
 * rather than adding new actions — e.g. both "Manage Pricing" and "Manage Categories" become
 * `products:manage_settings`; "AI Customer Analysis"/"Use AI Product Expert" become
 * `customers:execute_ai`/`products:execute_ai`; "Export Documents" reuses the existing
 * `documents:export` permission. `modules/trading` is deferred to Phase 5 (see
 * docs/DOMAIN_MODEL_PHASE4.md) so it is deliberately not seeded here.
 */
const PHASE4_MODULES = ['customers', 'products', 'quotations', 'orders'];

/**
 * Phase 5's Inventory, Procurement & Finance surface area (docs 14/16/17). No new roles were
 * needed — `INVENTORY_MANAGER`/`PROCUREMENT_MANAGER`/`FINANCE_MANAGER` already exist in
 * `SYSTEM_ROLES.company` from Phase 1, unused until now. `modules/trading` (Contracts,
 * Shipments, live FX) remains deferred — see docs/DOMAIN_MODEL_PHASE5.md.
 */
const PHASE5_MODULES = ['inventory', 'procurement', 'accounting'];

export const SEED_PERMISSIONS = [
  ...PHASE1_MODULES,
  ...PHASE2_MODULES,
  ...PHASE3_MODULES,
  ...PHASE4_MODULES,
  ...PHASE5_MODULES,
].flatMap((module) =>
  Object.values(PermissionAction).map((action) => ({
    code: `${module}:${action.toLowerCase()}`,
    module,
    action,
  })),
);
