import type { AuditEventType } from '@platform/core';

/** Same shape every module's audit writer port uses — satisfied by AuditService at the composition root. */
export interface AnalyticsAuditWriter {
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

/**
 * A single non-tool-calling completion call — satisfied at the composition root by
 * `AiRouterService.chatComplete()` (`packages/ai`), never imported directly into this module.
 * Used only for the AI Insight narrative; every number it narrates over is computed for real by
 * `AnalyticsKpiService` first — the AI never invents a figure, only explains one.
 */
export interface AiNarrativePort {
  generateNarrative(companyId: string, systemPrompt: string, userPrompt: string): Promise<string>;
}

/** Satisfied by DocumentService.upload()/.download() at the composition root — real R2/MinIO storage. */
export interface ReportStoragePort {
  store(input: {
    companyId: string;
    entityId: string;
    title: string;
    buffer: Buffer;
    contentType: string;
    filename: string;
    ownerUserId: string;
  }): Promise<{ documentId: string }>;
  getDownloadUrl(documentId: string, actorUserId: string): Promise<string>;
}
