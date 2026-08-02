/**
 * Real Plugin install/activate/deactivate/uninstall lifecycle (doc 29) against real Postgres —
 * see docs/DOMAIN_MODEL_PHASE8.md, Batch B. Proves the lifecycle against a real effect (gating
 * the real Webhooks feature from doc 27, built in the same batch), not a no-op toggle.
 *
 * Requires DATABASE_URL to point at the Postgres in docker/docker-compose.yml.
 */
import { PrismaClient } from '@prisma/client';
import { TenantContextStore } from '@platform/core';
import { getPrismaClient } from '@platform/database';
import { PluginService, WebhookService } from '@modules/extensibility';

const db = getPrismaClient();
const rawDb = new PrismaClient();

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

function asCompany<T>(companyId: string, userId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

describe('Plugin lifecycle gating Webhooks (live Postgres)', () => {
  let companyId: string;
  let userId: string;
  const auditEntries: Array<{ eventType: string; entityId: string | null }> = [];

  const audit = {
    record: async (entry: { eventType: string; entityId: string | null }) => {
      auditEntries.push(entry);
    },
  };
  const pluginService = new PluginService(db, audit);
  const webhookService = new WebhookService(db, pluginService, audit);

  beforeAll(async () => {
    const company = await withoutTenant(() =>
      rawDb.company.create({
        data: {
          companyCode: `TEST-PLUGIN-${Date.now()}`,
          legalName: 'Plugin Lifecycle Test Co',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      }),
    );
    companyId = company.id;

    const user = await withoutTenant(() =>
      rawDb.user.create({
        data: {
          companyId,
          firstName: 'Plugin',
          lastName: 'Tester',
          email: `plugin-tester-${Date.now()}@test.local`,
          passwordHash: 'x',
          status: 'ACTIVE',
        },
      }),
    );
    userId = user.id;
  }, 30000);

  afterAll(async () => {
    await withoutTenant(async () => {
      await rawDb.webhook.deleteMany({ where: { companyId } });
      await rawDb.pluginInstall.deleteMany({ where: { companyId } });
      await rawDb.auditLog.deleteMany({ where: { companyId } });
      await rawDb.user.deleteMany({ where: { companyId } });
      await rawDb.company.delete({ where: { id: companyId } });
    });
    await rawDb.$disconnect();
  });

  it('lists the real catalog with the webhooks plugin not installed initially', async () => {
    const list = await asCompany(companyId, userId, () => pluginService.list(companyId));
    const webhooksEntry = list.find((p) => p.key === 'webhooks');
    expect(webhooksEntry).toBeDefined();
    expect(webhooksEntry!.installed).toBe(false);
    expect(webhooksEntry!.enabled).toBe(false);
  });

  it('blocks webhook creation before the plugin is installed and activated', async () => {
    await expect(
      asCompany(companyId, userId, () =>
        webhookService.create(companyId, 'https://example.com/hook', ['OrderCreated'], userId),
      ),
    ).rejects.toThrow();
  });

  it('installs, then still blocks creation until activated', async () => {
    await asCompany(companyId, userId, () => pluginService.install(companyId, 'webhooks', userId));
    expect(auditEntries.some((e) => e.eventType === 'PLUGIN_INSTALLED')).toBe(true);

    const list = await asCompany(companyId, userId, () => pluginService.list(companyId));
    expect(list.find((p) => p.key === 'webhooks')!.installed).toBe(true);
    expect(list.find((p) => p.key === 'webhooks')!.enabled).toBe(false);

    await expect(
      asCompany(companyId, userId, () =>
        webhookService.create(companyId, 'https://example.com/hook', ['OrderCreated'], userId),
      ),
    ).rejects.toThrow();
  });

  it('activates the plugin, allowing a real webhook to be created', async () => {
    await asCompany(companyId, userId, () => pluginService.activate(companyId, 'webhooks', userId));
    expect(auditEntries.some((e) => e.eventType === 'PLUGIN_ACTIVATED')).toBe(true);

    const webhook = await asCompany(companyId, userId, () =>
      webhookService.create(companyId, 'https://example.com/hook', ['OrderCreated'], userId),
    );
    expect(webhook.url).toBe('https://example.com/hook');

    const rawRow = await withoutTenant(() =>
      rawDb.webhook.findUnique({ where: { id: webhook.id } }),
    );
    expect(rawRow!.secret).toBeTruthy();
  });

  it('deactivates the plugin, blocking new webhook creation again', async () => {
    await asCompany(companyId, userId, () =>
      pluginService.deactivate(companyId, 'webhooks', userId),
    );
    expect(auditEntries.some((e) => e.eventType === 'PLUGIN_DEACTIVATED')).toBe(true);

    await expect(
      asCompany(companyId, userId, () =>
        webhookService.create(companyId, 'https://example.com/hook-2', ['OrderCreated'], userId),
      ),
    ).rejects.toThrow();
  });

  it('uninstalls the plugin, leaving it absent from the installed state again', async () => {
    await asCompany(companyId, userId, () =>
      pluginService.uninstall(companyId, 'webhooks', userId),
    );
    expect(auditEntries.some((e) => e.eventType === 'PLUGIN_UNINSTALLED')).toBe(true);

    const list = await asCompany(companyId, userId, () => pluginService.list(companyId));
    expect(list.find((p) => p.key === 'webhooks')!.installed).toBe(false);
  });
});
