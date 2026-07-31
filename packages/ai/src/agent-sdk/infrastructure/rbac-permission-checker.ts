import type { TenantScopedPrismaClient } from '@platform/database';
import type { PermissionAction } from '@platform/types';
import { hasPermission } from '@platform/permissions';
import type { PermissionChecker } from '../domain/ports/tool-permission.port';

/**
 * Re-derives a user's granted permission codes from their role assignments — the same RBAC
 * data PermissionsGuard checks (packages/permissions' hasPermission/permissionCode), just
 * queried from a raw userId instead of a cached JWT payload's roles list, since the
 * orchestrator has no HTTP request to read that from.
 */
export class RbacPermissionChecker implements PermissionChecker {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  async hasPermission(userId: string, module: string, action: PermissionAction): Promise<boolean> {
    const userRoles = await this.prisma.userRole.findMany({ where: { userId } });
    const roleIds = userRoles.map((r) => r.roleId);
    if (roleIds.length === 0) return false;

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: roleIds } },
      select: { permission: { select: { code: true } } },
    });
    const grantedCodes = new Set(rolePermissions.map((rp) => rp.permission.code));

    return hasPermission(grantedCodes, { module, action });
  }
}
