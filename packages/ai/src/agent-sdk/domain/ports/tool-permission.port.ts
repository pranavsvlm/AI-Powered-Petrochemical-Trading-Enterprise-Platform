import type { PermissionAction } from '@platform/types';

/**
 * Tool-permission-scoping — an agent executes with the CALLING USER's own permissions, never
 * an elevated identity. Implemented by re-deriving the user's granted permission codes from
 * their role assignments (the same RBAC data PermissionsGuard checks), since the orchestrator
 * only has a raw userId, not a cached JWT payload's roles list. See
 * docs/DOMAIN_MODEL_PHASE6.md §11.
 */
export interface PermissionChecker {
  hasPermission(userId: string, module: string, action: PermissionAction): Promise<boolean>;
}
