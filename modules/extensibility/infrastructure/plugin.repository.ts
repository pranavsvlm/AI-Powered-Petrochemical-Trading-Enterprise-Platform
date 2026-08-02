import type { TenantScopedPrismaClient, PluginInstall } from '@platform/database';

export class PluginRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  listInstalled(companyId: string): Promise<PluginInstall[]> {
    return this.db.pluginInstall.findMany({ where: { companyId, uninstalledAt: null } });
  }

  findActive(companyId: string, pluginKey: string): Promise<PluginInstall | null> {
    return this.db.pluginInstall.findFirst({
      where: { companyId, pluginKey, uninstalledAt: null },
    });
  }

  install(companyId: string, pluginKey: string): Promise<PluginInstall> {
    return this.db.pluginInstall.create({ data: { companyId, pluginKey, enabled: false } });
  }

  setEnabled(id: string, enabled: boolean): Promise<PluginInstall> {
    return this.db.pluginInstall.update({ where: { id }, data: { enabled } });
  }

  uninstall(id: string): Promise<PluginInstall> {
    return this.db.pluginInstall.update({
      where: { id },
      data: { enabled: false, uninstalledAt: new Date() },
    });
  }
}
