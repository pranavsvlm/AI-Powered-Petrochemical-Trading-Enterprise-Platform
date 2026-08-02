import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { generateOpaqueToken, hashToken } from '@platform/auth';
import type { TenantScopedPrismaClient, ApiKey } from '@platform/database';
import { ApiKeyRepository } from '../infrastructure/api-key.repository';
import type { ExtensibilityAuditWriter } from './ports';

export interface CreatedApiKey {
  apiKey: ApiKey;
  /** The raw secret — shown to the caller exactly once, at creation. Never persisted or
   * re-derivable from `keyHash`. */
  rawKey: string;
}

/**
 * A key authenticates AS the owning user and inherits that user's real RBAC roles — no separate
 * scopes system. `keyHash` (sha256) is what's persisted; the raw secret is only ever returned
 * from `create()`, matching the standard PAT-style "shown once" UX (GitHub/Stripe).
 */
@Injectable()
export class ApiKeyService {
  private readonly repo: ApiKeyRepository;

  constructor(
    db: TenantScopedPrismaClient,
    private readonly audit: ExtensibilityAuditWriter,
  ) {
    this.repo = new ApiKeyRepository(db);
  }

  async create(
    companyId: string,
    userId: string,
    name: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<CreatedApiKey> {
    const rawKey = `nvk_${generateOpaqueToken(32)}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = hashToken(rawKey);

    const apiKey = await this.repo.create({ companyId, userId, name, keyPrefix, keyHash });

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.API_KEY_CREATED,
      entityType: 'ApiKey',
      entityId: apiKey.id,
      after: { name, keyPrefix },
      ipAddress: ipAddress ?? null,
    });

    return { apiKey, rawKey };
  }

  list(companyId: string): Promise<ApiKey[]> {
    return this.repo.list(companyId);
  }

  async revoke(
    id: string,
    companyId: string,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<ApiKey> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundException('API key not found.');
    if (existing.companyId !== companyId) {
      throw new ForbiddenException('API key belongs to a different company.');
    }

    const revoked = await this.repo.revoke(id);

    await this.audit.record({
      companyId,
      actorUserId,
      eventType: AuditEventType.API_KEY_REVOKED,
      entityType: 'ApiKey',
      entityId: id,
      ipAddress: ipAddress ?? null,
    });

    return revoked;
  }
}
