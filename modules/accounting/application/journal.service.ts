import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import { EVENT_TYPES } from '@platform/event-bus';
import type { TenantScopedPrismaClient } from '@platform/database';
import { assertJournalBalances } from '../domain/journal-balance';
import {
  JournalRepository,
  type CreateJournalInput,
  type JournalWithLines,
} from '../infrastructure/accounting.repository';

export interface JournalAuditWriter {
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

export interface JournalEventPublisher {
  publish(
    topic: string,
    companyId: string,
    payload: unknown,
    source: string,
  ): Promise<{ eventId: string }>;
}

/**
 * Application-layer use case for the Journal aggregate (doc 14): manual double-entry posting.
 * InvoiceService/SupplierBillService post their own source-generated journals directly through
 * JournalRepository (same module, no port needed) so they participate in the same transaction
 * as the Invoice/SupplierBill row — this service is for standalone/manual entries and for
 * listing/viewing journals. assertJournalBalances is the one gate both paths share.
 */
@Injectable()
export class JournalService {
  private readonly logger = new Logger(JournalService.name);
  private readonly repo: JournalRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly events: JournalEventPublisher,
    private readonly audit: JournalAuditWriter,
  ) {
    this.repo = new JournalRepository(db);
  }

  async post(
    input: CreateJournalInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<JournalWithLines> {
    assertJournalBalances(input.lines);
    const journal = await this.repo.create(this.db, input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.JOURNAL_POSTED,
      entityType: 'Journal',
      entityId: journal.id,
      after: { journalNumber: input.journalNumber, sourceType: input.sourceType },
      ipAddress: ipAddress ?? null,
    });
    await this.events.publish(
      EVENT_TYPES.JOURNAL_POSTED,
      input.companyId,
      { journalId: journal.id, sourceType: input.sourceType },
      'accounting',
    );
    return journal;
  }

  async getById(id: string): Promise<JournalWithLines> {
    const journal = await this.repo.findById(id);
    if (!journal) throw new NotFoundException('Journal not found.');
    return journal;
  }

  list(filters: { companyId: string; sourceType?: string }): Promise<JournalWithLines[]> {
    return this.repo.list(filters);
  }
}
