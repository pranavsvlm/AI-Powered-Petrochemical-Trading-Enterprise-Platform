import type { AuditEventType } from '@platform/core';

/** Same shape every module's audit writer port uses — satisfied by AuditService at the composition root. */
export interface ExtensibilityAuditWriter {
  record(entry: {
    companyId: string | null;
    actorUserId: string | null;
    eventType: AuditEventType;
    entityType: string;
    entityId: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
  }): Promise<void>;
}
