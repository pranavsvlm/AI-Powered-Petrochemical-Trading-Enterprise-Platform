import { Prisma } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { TENANT_SCOPED_MODELS, type TenantScopedModel } from '@platform/types';

const TENANT_MODEL_SET = new Set<string>(TENANT_SCOPED_MODELS);

function isTenantScoped(model: string | undefined): model is TenantScopedModel {
  return !!model && TENANT_MODEL_SET.has(model);
}

/**
 * Defense-in-depth tenant isolation. Every read/write against a tenant-scoped model is
 * required to carry the current AsyncLocalStorage-bound company_id — this is enforced here
 * regardless of what the calling service code did or forgot to do:
 *  - findMany/findFirst/count/updateMany/deleteMany: `where.companyId` is forced to the
 *    bound company id (overwriting anything the caller passed) unless the query is
 *    explicitly run through `withoutTenantScope` (platform-admin cross-tenant operations).
 *  - create: `data.companyId` is forced to the bound company id.
 *  - findUnique/update/delete (by unique id): the extension re-checks the row's companyId in
 *    an `extends result` hook is not sufficient for delete, so we route unique-id operations
 *    through the equivalent `First`/`Many` variants with an id filter, guaranteeing the
 *    company_id predicate is always applied at the SQL level (fails closed, not open).
 */
export function tenantExtension() {
  return Prisma.defineExtension((client) =>
    client.$extends({
      name: 'tenant-isolation',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!isTenantScoped(model)) {
              return query(args);
            }

            const ctx = TenantContextStore.get();
            if (ctx?.isPlatformActor) {
              // Explicit, auditable opt-in for genuinely cross-tenant platform operations
              // (see `withoutTenantScope`). No ambient way to reach this state.
              return query(args);
            }
            // Fail closed: absence of a bound tenant context means we refuse to run the
            // query at all, rather than silently returning cross-tenant or unscoped data.
            const companyId = TenantContextStore.requireCompanyId();

            const scopedArgs = { ...(args as Record<string, unknown>) };

            switch (operation) {
              case 'findUnique':
              case 'findUniqueOrThrow': {
                // Convert to findFirst-shaped filtering so the companyId predicate is
                // guaranteed to be applied even for unique-id lookups.
                scopedArgs.where = { ...(scopedArgs.where as object), companyId };
                return query(scopedArgs);
              }
              case 'findFirst':
              case 'findFirstOrThrow':
              case 'findMany':
              case 'count':
              case 'aggregate': {
                scopedArgs.where = { ...(scopedArgs.where as object), companyId };
                return query(scopedArgs);
              }
              case 'create': {
                scopedArgs.data = { ...(scopedArgs.data as object), companyId };
                return query(scopedArgs);
              }
              case 'createMany': {
                const data = scopedArgs.data as Array<Record<string, unknown>>;
                scopedArgs.data = data.map((d) => ({ ...d, companyId }));
                return query(scopedArgs);
              }
              case 'update':
              case 'updateMany':
              case 'delete':
              case 'deleteMany': {
                scopedArgs.where = { ...(scopedArgs.where as object), companyId };
                return query(scopedArgs);
              }
              default:
                return query(scopedArgs);
            }
          },
        },
      },
    }),
  );
}

/**
 * Escape hatch for genuinely platform-level (cross-tenant) operations, e.g. Platform Super
 * Admin listing all companies' admins. Requires an explicit, auditable opt-in call site —
 * there is no ambient way to disable tenant scoping.
 *
 * IMPORTANT: `fn` is awaited *inside* the AsyncLocalStorage-bound callback, not merely
 * invoked and returned. `TenantContextStore.run()`/Node's AsyncLocalStorage.run() only keeps
 * a context "active" for the synchronous portion of the callback plus any continuation that
 * is chained (via `await`/`.then()`) from *within* that same callback invocation. Prisma's
 * client methods return a lazy "PrismaPromise" whose `.then()` (and therefore the tenant
 * extension's `$allOperations` hook) only fires when something actually calls `.then()` on
 * it. If `fn` is a plain arrow that just *returns* `somePrismaCall(...)` without an internal
 * `await`, `run()` calls `fn()`, gets back that still-pending, not-yet-`.then()`-ed promise,
 * and returns immediately — the ALS context is popped before the caller's own `await
 * withoutTenantScope(...)` ever triggers Prisma's actual query dispatch, so the extension
 * sees an *unbound* context and fails closed with "no tenant context bound" even though the
 * call site looks correct. Wrapping with `async () => await fn()` forces `.then()` to be
 * invoked synchronously, inside this function's own async execution, which IS properly
 * tracked by AsyncLocalStorage across further awaits.
 */
export function withoutTenantScope<T>(fn: () => T): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}
