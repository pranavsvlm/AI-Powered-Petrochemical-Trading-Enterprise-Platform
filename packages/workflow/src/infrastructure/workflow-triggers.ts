import cron, { type ScheduledTask } from 'node-cron';
import type { RedisStreamsEventBus } from '@platform/event-bus';
import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import { TenantContextStore } from '@platform/core';
import type { WorkflowExecutionEngine } from '../application/workflow-execution.engine';
import type { WorkflowManagementService } from '../application/workflow-management.service';

/**
 * Trigger types: Manual (called directly by API controller — not wired here), API Trigger
 * (same, via a dedicated endpoint), Scheduled Trigger (real cron via node-cron), and
 * Event-driven trigger (subscribes to Event Bus topics). Other trigger "types" from doc 22
 * (Customer Created, RFQ Received, etc.) are just example event names for the EVENT trigger
 * type and are not special-cased.
 */
export class WorkflowTriggerScheduler {
  private readonly tasks = new Map<string, ScheduledTask>();

  constructor(
    private readonly engine: WorkflowExecutionEngine,
    private readonly management: WorkflowManagementService,
    private readonly eventBus: RedisStreamsEventBus,
    private readonly prisma: TenantScopedPrismaClient = getPrismaClient(),
  ) {}

  async registerScheduled(
    workflowId: string,
    companyId: string,
    cronExpression: string,
  ): Promise<void> {
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }
    const task = cron.schedule(cronExpression, () => {
      void this.runWorkflow(workflowId, companyId, {});
    });
    this.tasks.set(workflowId, task);
  }

  async registerEventDriven(
    workflowId: string,
    companyId: string,
    eventType: string,
  ): Promise<void> {
    await this.eventBus.subscribe(
      eventType,
      `workflow:${workflowId}`,
      async (envelope) => {
        if (envelope.companyId !== companyId) return;
        await this.runWorkflow(workflowId, companyId, envelope.payload as Record<string, unknown>);
      },
      { companyId },
    );
  }

  async unregister(workflowId: string): Promise<void> {
    this.tasks.get(workflowId)?.stop();
    this.tasks.delete(workflowId);
  }

  private async runWorkflow(
    workflowId: string,
    companyId: string,
    initialContext: Record<string, unknown>,
  ) {
    await TenantContextStore.run(
      { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
      async () => {
        const graph = await this.management.loadPublishedGraph(workflowId);
        await this.engine.start(graph, workflowId, companyId, initialContext);
      },
    );
  }
}
