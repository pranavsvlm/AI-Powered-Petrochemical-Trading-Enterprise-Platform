import type { TenantScopedPrismaClient, TimeEntry } from '@platform/database';

export interface StartTimeEntryInput {
  companyId: string;
  userId: string;
  taskId?: string;
  projectId?: string;
  startedAt: Date;
  notes?: string;
}

export interface ManualTimeEntryInput extends StartTimeEntryInput {
  endedAt: Date;
  durationMinutes: number;
}

export class TimeEntryRepository {
  constructor(private readonly db: TenantScopedPrismaClient) {}

  start(input: StartTimeEntryInput): Promise<TimeEntry> {
    return this.db.timeEntry.create({ data: input });
  }

  createManual(input: ManualTimeEntryInput): Promise<TimeEntry> {
    return this.db.timeEntry.create({ data: input });
  }

  findById(id: string): Promise<TimeEntry | null> {
    return this.db.timeEntry.findUnique({ where: { id } });
  }

  stop(id: string, endedAt: Date, durationMinutes: number): Promise<TimeEntry> {
    return this.db.timeEntry.update({ where: { id }, data: { endedAt, durationMinutes } });
  }

  list(filters: {
    companyId: string;
    userId?: string;
    taskId?: string;
    projectId?: string;
  }): Promise<TimeEntry[]> {
    return this.db.timeEntry.findMany({
      where: {
        companyId: filters.companyId,
        userId: filters.userId,
        taskId: filters.taskId,
        projectId: filters.projectId,
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  findRunning(companyId: string, userId: string): Promise<TimeEntry | null> {
    return this.db.timeEntry.findFirst({
      where: { companyId, userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }
}
