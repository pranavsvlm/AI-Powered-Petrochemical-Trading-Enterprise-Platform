import { PrismaClient } from '@prisma/client';
import { SEED_PERMISSIONS, SYSTEM_ROLES } from '@platform/permissions';

/**
 * Seeds platform-level roles + the Phase 1 permission catalogue. Company-level system roles
 * (Company Admin, Finance Manager, ...) are seeded per-company at company-creation time by
 * CompanyService in a later iteration; this script seeds the shared, company-independent
 * catalogue: Permission rows and the two platform roles (company_id = null).
 */
async function main() {
  const db = new PrismaClient();

  for (const perm of SEED_PERMISSIONS) {
    await db.permission.upsert({
      where: { code: perm.code },
      create: perm,
      update: { module: perm.module, action: perm.action },
    });
  }

  for (const roleName of SYSTEM_ROLES.platform) {
    const existing = await db.role.findFirst({ where: { companyId: null, name: roleName } });
    if (!existing) {
      await db.role.create({ data: { name: roleName, isSystemRole: true, companyId: null } });
    }
  }

  console.log(
    `Seeded ${SEED_PERMISSIONS.length} permissions and ${SYSTEM_ROLES.platform.length} platform roles.`,
  );
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
