import { PermissionAction } from '@platform/types';

/** Builds the canonical `Permission.code` string, e.g. "users:create". */
export function permissionCode(module: string, action: PermissionAction): string {
  return `${module}:${action.toLowerCase()}`;
}

export interface RequiredPermission {
  module: string;
  action: PermissionAction;
}

/** Pure function: does the given set of permission codes satisfy the requirement? */
export function hasPermission(
  grantedCodes: ReadonlySet<string>,
  required: RequiredPermission,
): boolean {
  return grantedCodes.has(permissionCode(required.module, required.action));
}
