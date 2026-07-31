import 'reflect-metadata';
import { PrismaClient } from '@platform/database';
import { DEFAULT_PROMPT_TEMPLATES, AGENT_SYSTEM_PROMPTS } from '@platform/ai';

const ALL_PROMPT_TEMPLATES: Record<string, string> = {
  ...DEFAULT_PROMPT_TEMPLATES,
  ...AGENT_SYSTEM_PROMPTS,
};

/**
 * Seeds the platform-default (companyId: null) PromptTemplate rows every AI seam falls back
 * to when a company hasn't published its own override — see docs/DOMAIN_MODEL_PHASE6.md §5.
 *
 * Deliberately lives in apps/backend, not packages/database/prisma/seed.ts: packages/ai
 * depends on packages/database (for TenantScopedPrismaClient/PromptTemplate types), so
 * packages/database importing packages/ai's DEFAULT_PROMPT_TEMPLATES back would be a real
 * dependency cycle. apps/backend already depends on everything, so it's the natural place to
 * assemble AI-package-specific bootstrap data.
 *
 * Uses a raw, un-extended PrismaClient — never getPrismaClient() — because the tenant
 * extension would force `companyId` to whatever tenant context happens to be bound (or throw
 * if none is), actively breaking a `companyId: null` platform-default write. Idempotent:
 * re-running with unchanged content is a no-op; changed content publishes a new version.
 */
async function main(): Promise<void> {
  const db = new PrismaClient();
  let created = 0;
  let publishedVersions = 0;

  for (const [key, content] of Object.entries(ALL_PROMPT_TEMPLATES)) {
    let template = await db.promptTemplate.findFirst({ where: { companyId: null, key } });
    if (!template) {
      template = await db.promptTemplate.create({ data: { companyId: null, key, isActive: true } });
      created += 1;
    }

    const latestVersion = await db.promptTemplateVersion.findFirst({
      where: { promptTemplateId: template.id },
      orderBy: { version: 'desc' },
    });

    if (!latestVersion || latestVersion.content !== content) {
      await db.promptTemplateVersion.create({
        data: {
          promptTemplateId: template.id,
          version: (latestVersion?.version ?? 0) + 1,
          content,
          publishedAt: new Date(),
        },
      });
      publishedVersions += 1;
    }
  }

  console.log(
    `Seeded AI prompt templates: ${created} new template(s), ${publishedVersions} version(s) published (${Object.keys(ALL_PROMPT_TEMPLATES).length} total keys).`,
  );
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
