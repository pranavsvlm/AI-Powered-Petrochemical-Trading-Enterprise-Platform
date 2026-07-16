import { Injectable, Logger } from '@nestjs/common';
import { AuditEventType, type AuditEntry } from '@platform/core';
import { PrismaService } from '../../prisma/prisma.service';
import type { TenantScopedTransactionClient } from '@platform/database';

/**
 * Insert-only audit log writer. `record` MUST be called with the same `tx` (Prisma
 * transaction client) as the mutating write it documents, so that if the audit insert
 * fails the whole operation rolls back — audit logging is never best-effort here.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: TenantScopedTransactionClient): Promise<void> {
    const client = tx ?? this.prisma.client;
    await client.auditLog.create({
      data: {
        companyId: entry.companyId,
        actorUserId: entry.actorUserId,
        eventType: entry.eventType,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before === undefined ? undefined : (entry.before as object),
        after: entry.after === undefined ? undefined : (entry.after as object),
        ipAddress: entry.ipAddress ?? null,
      },
    });
    this.logger.log(
      `audit: ${entry.eventType} ${entry.entityType}${entry.entityId ? `#${entry.entityId}` : ''}`,
    );
  }
}

export { AuditEventType };
