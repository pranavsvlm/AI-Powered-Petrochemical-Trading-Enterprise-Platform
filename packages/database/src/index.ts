export const PACKAGE_NAME = '@platform/database';
export { getPrismaClient } from './client';
export type { TenantScopedPrismaClient, TenantScopedTransactionClient } from './client';
export { tenantExtension, withoutTenantScope } from './tenant-extension';
export * from '@prisma/client';
