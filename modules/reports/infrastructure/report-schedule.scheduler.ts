import cron, { type ScheduledTask } from 'node-cron';
import { TenantContextStore } from '@platform/core';
import {
  withoutTenantScope,
  type ReportSchedule,
  type ReportScheduleFrequency,
} from '@platform/database';
import { AnalyticsReportService } from '../application/analytics-report.service';
import { ReportRepository } from './report.repository';

const FREQUENCY_CRON: Record<ReportScheduleFrequency, string> = {
  DAILY: '0 6 * * *',
  WEEKLY: '0 6 * * 1',
  MONTHLY: '0 6 1 * *',
};

const POLL_INTERVAL_MS = 5 * 60 * 1000;

function withCompanyContext<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

/**
 * Real recurring report delivery via `node-cron` — the same pattern
 * `packages/workflow`'s `WorkflowTriggerScheduler` already established for scheduled workflow
 * triggers, applied directly here rather than modeling reports as Workflow nodes (that would
 * entangle Reports with the Workflow engine's own state machine for no real benefit). Runs
 * inside the worker process, polling for newly-created/toggled schedules on a fixed interval —
 * same reasoning `apps/backend/src/scheduler/scheduler.ts`'s own workflow polling uses.
 */
export async function registerReportScheduleRunner(
  reportRepository: ReportRepository,
  reportService: AnalyticsReportService,
): Promise<() => void> {
  const tasks = new Map<string, ScheduledTask>();

  async function sync(): Promise<void> {
    const schedules = await withoutTenantScope(() => reportRepository.listActiveSchedules());
    const activeIds = new Set(schedules.map((s) => s.id));

    for (const [id, task] of tasks) {
      if (!activeIds.has(id)) {
        task.stop();
        tasks.delete(id);
      }
    }

    for (const schedule of schedules) {
      if (tasks.has(schedule.id)) continue;
      const expression = FREQUENCY_CRON[schedule.frequency];
      const task = cron.schedule(expression, () => {
        void runOne(schedule, reportRepository, reportService);
      });
      tasks.set(schedule.id, task);
    }
  }

  await sync();
  const interval = setInterval(() => void sync(), POLL_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    for (const task of tasks.values()) task.stop();
    tasks.clear();
  };
}

async function runOne(
  schedule: ReportSchedule,
  reportRepository: ReportRepository,
  reportService: AnalyticsReportService,
): Promise<void> {
  const actorUserId = schedule.createdByUserId;
  if (!actorUserId) return;
  await withCompanyContext(schedule.companyId, () =>
    reportService.runSchedule(schedule, actorUserId),
  );
}

/** Exposed for e2e tests — fires a specific schedule's handler directly, same "invoke the
 * handler function directly" pattern `tasks-event-consumption.e2e-spec.ts` uses rather than
 * waiting on a real cron tick. */
export async function runDueSchedules(
  scheduleIds: string[],
  reportRepository: ReportRepository,
  reportService: AnalyticsReportService,
): Promise<void> {
  for (const id of scheduleIds) {
    const schedule = await withoutTenantScope(() => reportRepository.findSchedule(id));
    if (schedule) await runOne(schedule, reportRepository, reportService);
  }
}
