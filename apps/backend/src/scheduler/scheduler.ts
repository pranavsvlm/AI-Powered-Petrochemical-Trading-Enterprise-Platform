import 'reflect-metadata';
import { getPrismaClient } from '@platform/database';
import { TenantContextStore } from '@platform/core';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  NotImplementedAiDecisionProvider,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import {
  NodeExecutor,
  PdfKitDocumentGenerator,
  WorkflowExecutionEngine,
  WorkflowManagementService,
  WorkflowResumeQueue,
  WorkflowTriggerScheduler,
} from '@platform/workflow';
import {
  ChannelAdapterRegistry,
  ConsoleEmailSenderAdapter,
  NotificationService,
  SmtpEmailSenderAdapter,
} from '@platform/notifications';

/**
 * Scheduler process: registers real cron (node-cron) and event-driven (Event Bus subscribe)
 * triggers for every PUBLISHED workflow whose triggerType is SCHEDULED or EVENT, per
 * docs/22_Workflow_Engine.md's trigger types. Manual/API triggers are handled directly by
 * the workflows.controller.ts REST endpoints and need no background registration.
 *
 * Polls the Workflow table on a fixed interval so newly-published scheduled/event workflows
 * are picked up without a full process restart.
 */
async function main(): Promise<void> {
  const prisma = getPrismaClient();
  const eventBus = new RedisStreamsEventBus();

  const ruleRepository = new RuleRepository(prisma);
  const ruleActionExecutor = new RuleActionExecutor({
    eventBus,
    aiDecisionProvider: new NotImplementedAiDecisionProvider(),
  });
  const rulesEvaluation = new RuleEvaluationService(ruleRepository, ruleActionExecutor, [
    new LegacyApprovalRuleSource(prisma),
    new NativeRuleSource((companyId, module) => ruleRepository.loadApplicable(companyId, module)),
  ]);

  const emailAdapter =
    process.env.NOTIFICATIONS_EMAIL_ADAPTER === 'smtp'
      ? new SmtpEmailSenderAdapter()
      : new ConsoleEmailSenderAdapter();
  const notificationRegistry = new ChannelAdapterRegistry(emailAdapter);
  const notificationService = new NotificationService(notificationRegistry, prisma);

  const resumeQueue = new WorkflowResumeQueue();
  const workflowManagement = new WorkflowManagementService(prisma);
  const nodeExecutor = new NodeExecutor({
    prisma,
    rulesEngine: rulesEvaluation,
    notificationClient: {
      notify: (input) =>
        notificationService.send(input as never).then((n) => ({ notificationId: n.id })),
    },
    documentGenerator: new PdfKitDocumentGenerator(),
    aiDecisionProvider: new NotImplementedAiDecisionProvider(),
    enqueueDelay: (executionId, resumeAt) => resumeQueue.enqueue(executionId, resumeAt),
  });
  const executionEngine = new WorkflowExecutionEngine(nodeExecutor, prisma);
  const triggerScheduler = new WorkflowTriggerScheduler(
    executionEngine,
    workflowManagement,
    eventBus,
    prisma,
  );

  const registered = new Set<string>();

  async function syncTriggers(): Promise<void> {
    const workflows = await withoutTenant(() =>
      prisma.workflow.findMany({ where: { status: 'PUBLISHED' } }),
    );
    for (const workflow of workflows) {
      if (registered.has(workflow.id)) continue;
      const config = (workflow.triggerConfig ?? {}) as { cron?: string; eventType?: string };
      if (workflow.triggerType === 'SCHEDULED' && config.cron) {
        await triggerScheduler.registerScheduled(workflow.id, workflow.companyId, config.cron);
        registered.add(workflow.id);
        console.log(
          `scheduler: registered cron trigger for workflow ${workflow.id} (${config.cron})`,
        );
      } else if (workflow.triggerType === 'EVENT' && config.eventType) {
        await triggerScheduler.registerEventDriven(
          workflow.id,
          workflow.companyId,
          config.eventType,
        );
        registered.add(workflow.id);
        console.log(
          `scheduler: registered event trigger for workflow ${workflow.id} (${config.eventType})`,
        );
      }
    }
  }

  await syncTriggers();
  const SYNC_INTERVAL_MS = Number(process.env.WORKFLOW_TRIGGER_SYNC_INTERVAL_MS ?? 5 * 60 * 1000);
  const syncInterval = setInterval(() => {
    void syncTriggers().catch((err) => console.error('scheduler: trigger sync failed', err));
  }, SYNC_INTERVAL_MS);

  console.log('scheduler: started (workflow cron + event-driven trigger registration)');

  const shutdown = async () => {
    clearInterval(syncInterval);
    for (const workflowId of registered) {
      await triggerScheduler.unregister(workflowId);
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function withoutTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId: null, userId: null, sessionId: null, ipAddress: null, isPlatformActor: true },
    async () => await fn(),
  );
}

main().catch((err) => {
  console.error('scheduler: fatal startup error', err);
  process.exit(1);
});
