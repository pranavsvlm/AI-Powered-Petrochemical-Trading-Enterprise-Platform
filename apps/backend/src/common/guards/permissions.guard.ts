import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasPermission, permissionCode } from '@platform/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import {
  REQUIRE_PERMISSION_KEY,
  type RequiredPermissionMeta,
} from '../decorators/require-permission.decorator';
import type { JwtAccessTokenPayload } from '@platform/types';

/**
 * Enforces RBAC: the authenticated user's roles must collectively grant the permission
 * declared via @RequirePermission on the route handler. Runs after JwtAuthGuard.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<RequiredPermissionMeta | undefined>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true; // route did not declare a permission requirement

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtAccessTokenPayload | undefined;
    if (!user) throw new ForbiddenException('No authenticated user.');

    const rolePermissions = await this.prisma.client.rolePermission.findMany({
      where: { role: { id: { in: user.roles } } },
      select: { permission: { select: { code: true } } },
    });
    const grantedCodes = new Set(rolePermissions.map((rp) => rp.permission.code));

    if (!hasPermission(grantedCodes, required)) {
      throw new ForbiddenException(
        `Missing permission: ${permissionCode(required.module, required.action)}`,
      );
    }
    return true;
  }
}
