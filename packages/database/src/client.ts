import { PrismaClient } from '@prisma/client';
import { tenantExtension } from './tenant-extension';

// Lazy singleton so importing this module has no side effects until first use.
let prismaSingleton: ReturnType<typeof buildClient> | undefined;

function buildClient() {
  return new PrismaClient().$extends(tenantExtension());
}

export function getPrismaClient() {
  if (!prismaSingleton) {
    prismaSingleton = buildClient();
  }
  return prismaSingleton;
}

export type TenantScopedPrismaClient = ReturnType<typeof buildClient>;

/** The type of the callback argument NestJS services receive inside `$transaction(async (tx) => ...)`. */
export type TenantScopedTransactionClient = Omit<
  TenantScopedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
