import { SetMetadata } from '@nestjs/common';
import { PermissionAction } from '@platform/types';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

export interface RequiredPermissionMeta {
  module: string;
  action: PermissionAction;
}

export const RequirePermission = (module: string, action: PermissionAction) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, { module, action } satisfies RequiredPermissionMeta);
