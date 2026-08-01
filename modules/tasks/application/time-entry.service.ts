import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@platform/core';
import type { TenantScopedPrismaClient, TimeEntry } from '@platform/database';
import { computeDurationMinutes } from '../domain/time-tracking';
import {
  TimeEntryRepository,
  type StartTimeEntryInput,
  type ManualTimeEntryInput,
} from '../infrastructure/time-entry.repository';
import type { TaskAuditWriter } from './task.service';

/**
 * Application-layer use cases for time tracking (doc 25). A user may only have one running
 * timer at a time per company — `start()` rejects a second one rather than silently letting
 * two timers overlap.
 */
@Injectable()
export class TimeEntryService {
  private readonly repo: TimeEntryRepository;

  constructor(
    private readonly db: TenantScopedPrismaClient,
    private readonly audit: TaskAuditWriter,
  ) {
    this.repo = new TimeEntryRepository(db);
  }

  async start(input: StartTimeEntryInput): Promise<TimeEntry> {
    const running = await this.repo.findRunning(input.companyId, input.userId);
    if (running) {
      throw new BadRequestException(
        `A timer is already running (time entry ${running.id}) — stop it before starting another.`,
      );
    }
    return this.repo.start(input);
  }

  async stop(id: string, actorUserId: string, ipAddress?: string | null): Promise<TimeEntry> {
    const entry = await this.repo.findById(id);
    if (!entry) throw new NotFoundException('Time entry not found.');
    if (entry.endedAt) throw new BadRequestException('This time entry is already stopped.');
    const endedAt = new Date();
    const durationMinutes = computeDurationMinutes(entry.startedAt, endedAt);
    const updated = await this.repo.stop(id, endedAt, durationMinutes);
    await this.audit.record({
      companyId: entry.companyId,
      actorUserId,
      eventType: AuditEventType.TIME_LOGGED,
      entityType: 'TimeEntry',
      entityId: id,
      after: { durationMinutes },
      ipAddress: ipAddress ?? null,
    });
    return updated;
  }

  async createManual(
    input: ManualTimeEntryInput,
    actorUserId: string,
    ipAddress?: string | null,
  ): Promise<TimeEntry> {
    const entry = await this.repo.createManual(input);
    await this.audit.record({
      companyId: input.companyId,
      actorUserId,
      eventType: AuditEventType.TIME_LOGGED,
      entityType: 'TimeEntry',
      entityId: entry.id,
      after: { durationMinutes: input.durationMinutes },
      ipAddress: ipAddress ?? null,
    });
    return entry;
  }

  list(filters: Parameters<TimeEntryRepository['list']>[0]): Promise<TimeEntry[]> {
    return this.repo.list(filters);
  }
}
