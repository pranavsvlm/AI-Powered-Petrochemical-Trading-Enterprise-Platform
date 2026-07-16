import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  companyId: string | null;
  userId: string | null;
  sessionId: string | null;
  ipAddress: string | null;
  /** True only for platform-level actors (company_id null role) operating outside any tenant. */
  isPlatformActor: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const TenantContextStore = {
  /** Run `fn` with the given tenant context bound for the duration of the async call tree. */
  run<T>(context: TenantContext, fn: () => T): T {
    return storage.run(context, fn);
  },

  /** Returns the current context, or undefined if called outside a request scope. */
  get(): TenantContext | undefined {
    return storage.getStore();
  },

  /**
   * Returns the current company id, throwing if none is bound. Used by the Prisma tenant
   * extension to fail closed rather than silently return cross-tenant data.
   */
  requireCompanyId(): string {
    const ctx = storage.getStore();
    if (!ctx || !ctx.companyId) {
      throw new Error(
        'TenantContextStore: no tenant context bound — refusing to run a tenant-scoped query outside a request scope.',
      );
    }
    return ctx.companyId;
  },

  requireUserId(): string {
    const ctx = storage.getStore();
    if (!ctx || !ctx.userId) {
      throw new Error('TenantContextStore: no user bound in the current context.');
    }
    return ctx.userId;
  },
};
