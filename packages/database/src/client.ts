import { PrismaClient } from '@prisma/client';

// Lazy singleton so importing this module has no side effects until first use.
let prismaSingleton: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prismaSingleton) {
    prismaSingleton = new PrismaClient();
  }
  return prismaSingleton;
}
