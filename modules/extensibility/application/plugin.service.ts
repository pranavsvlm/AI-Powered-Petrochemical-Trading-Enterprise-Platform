import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { TenantScopedPrismaClient, PluginInstall } from '@platform/database';
import { PLUGIN_DEFINITIONS, type PluginDefinition } from '../domain/plugin-catalog';
import { PluginRepository } from '../infrastructure/plugin.repository';
import type { ExtensibilityAuditWriter } from './ports';

export interface PluginListItem extends PluginDefinition {
  installed: boolean;
  enabled: boolean;
  installId: string | null;
}

/**
 * The real per-tenant install/activate/deactivate/uninstall lifecycle doc 29 asks for —
 * gating first-party, in-process capabilities from the static `PLUGIN_DEFINITIONS` catalog, not
 * arbitrary uploaded third-party code (that's a distinct, deferred, security-critical initiative).
 */
@Injectable()
export class PluginService {
  private readonly repo: PluginRepository;

  constructor(
    db: TenantScopedPrismaClient,
    private readonly audit: ExtensibilityAuditWriter,
  ) {
    this.repo = new PluginRepository(db);
  }

  async list(companyId: string): Promise<PluginListItem[]> {
    const installed = await this.repo.listInstalled(companyId);
    const byKey = new Map(installed.map((i) => [i.pluginKey, i]));
    return PLUGIN_DEFINITIONS.map((def) => {
      const install = byKey.get(def.key);
      return {
        ...def,
        installed: !!install,
        enabled: install?.enabled ?? false,
        installId: install?.id ?? null,
      };
    });
  }

  async install(
    companyId: string,
    pluginKey: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PluginInstall> {
    if (!PLUGIN_DEFINITIONS.some((d) => d.key === pluginKey)) {
      throw new NotFoundException(`Unknown plugin "${pluginKey}".`);
    }
    const existing = await this.repo.findActive(companyId, pluginKey);
    if (existing) {
      throw new BadRequestException(`Plugin "${pluginKey}" is already installed.`);
    }

    const install = await this.repo.install(companyId, pluginKey);
    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.PLUGIN_INSTALLED,
      entityType: 'PluginInstall',
      entityId: install.id,
      after: { pluginKey },
      ipAddress: ipAddress ?? null,
    });
    return install;
  }

  async activate(
    companyId: string,
    pluginKey: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PluginInstall> {
    const install = await this.requireInstalled(companyId, pluginKey);
    const updated = await this.repo.setEnabled(install.id, true);
    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.PLUGIN_ACTIVATED,
      entityType: 'PluginInstall',
      entityId: install.id,
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async deactivate(
    companyId: string,
    pluginKey: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PluginInstall> {
    const install = await this.requireInstalled(companyId, pluginKey);
    const updated = await this.repo.setEnabled(install.id, false);
    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.PLUGIN_DEACTIVATED,
      entityType: 'PluginInstall',
      entityId: install.id,
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async uninstall(
    companyId: string,
    pluginKey: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<PluginInstall> {
    const install = await this.requireInstalled(companyId, pluginKey);
    const updated = await this.repo.uninstall(install.id);
    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.PLUGIN_UNINSTALLED,
      entityType: 'PluginInstall',
      entityId: install.id,
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async isEnabled(companyId: string, pluginKey: string): Promise<boolean> {
    const install = await this.repo.findActive(companyId, pluginKey);
    return install?.enabled ?? false;
  }

  private async requireInstalled(companyId: string, pluginKey: string): Promise<PluginInstall> {
    const install = await this.repo.findActive(companyId, pluginKey);
    if (!install) throw new NotFoundException(`Plugin "${pluginKey}" is not installed.`);
    return install;
  }
}
