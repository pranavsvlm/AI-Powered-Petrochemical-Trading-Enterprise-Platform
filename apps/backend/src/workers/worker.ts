import 'reflect-metadata';
import { getPrismaClient } from '@platform/database';
import { TenantContextStore } from '@platform/core';
import { RedisStreamsEventBus } from '@platform/event-bus';
import {
  LegacyApprovalRuleSource,
  NativeRuleSource,
  RuleActionExecutor,
  RuleEvaluationService,
  RuleRepository,
} from '@platform/rules-engine';
import { RealAiDecisionProvider } from '@platform/ai';
import { buildAiRouter, buildPromptTemplateService } from '../common/ai/ai-factory';
import {
  NodeExecutor,
  PdfKitDocumentGenerator,
  WorkflowExecutionEngine,
  WorkflowManagementService,
  WorkflowResumeQueue,
  createWorkflowResumeWorker,
} from '@platform/workflow';
import {
  ChannelAdapterRegistry,
  ConsoleEmailSenderAdapter,
  EscalationCheckerService,
  NotificationService,
  SmtpEmailSenderAdapter,
  registerWorkflowApprovalRequestedSubscriber,
} from '@platform/notifications';

/**
 * Background worker process (docker/docker-compose.yml's `worker` service runs
 * `node apps/backend/dist/workers/worker.js`). Hosts the long-running, non-HTTP pieces of
 * the Phase 2 platform backbone that must not live inside request-handling code:
 *  - the BullMQ resume worker for the Workflow Engine's DELAY node (docs/DOMAIN_MODEL_PHASE2.md §9)
 *  - the WorkflowApprovalRequested -> notify event-bus subscriber (module 4's required
 *    "other modules trigger notifications by publishing events" wiring example)
 *  - the Notification Center's escalation checker, run on a real interval
 */
async function main(): Promise<void> {
  const prisma = getPrismaClient();
  const eventBus = new RedisStreamsEventBus();
  const aiDecisionProvider = new RealAiDecisionProvider(
    buildAiRouter(prisma),
    buildPromptTemplateService(prisma),
  );

  const ruleRepository = new RuleRepository(prisma);
  const ruleActionExecutor = new RuleActionExecutor({
    eventBus,
    aiDecisionProvider,
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
    aiDecisionProvider,
    enqueueDelay: (executionId, resumeAt) => resumeQueue.enqueue(executionId, resumeAt),
  });
  const executionEngine = new WorkflowExecutionEngine(nodeExecutor, prisma);

  const resumeWorker = createWorkflowResumeWorker(executionEngine, async (executionId) => {
    const execution = await withoutTenant(() =>
      prisma.workflowExecution.findUniqueOrThrow({ where: { id: executionId } }),
    );
    return withTenant(execution.companyId, () =>
      workflowManagement.loadPublishedGraph(execution.workflowId),
    );
  });
  resumeWorker.on('completed', (job) => {
    console.log(`worker: resumed workflow execution ${job.data.executionId}`);
  });
  resumeWorker.on('failed', (job, err) => {
    console.error(`worker: failed to resume workflow execution ${job?.data?.executionId}`, err);
  });

  const unsubscribeApprovalNotify = await registerWorkflowApprovalRequestedSubscriber(
    eventBus,
    notificationService,
  );

  const escalationChecker = new EscalationCheckerService(notificationService, prisma);
  const ESCALATION_INTERVAL_MS = Number(process.env.ESCALATION_CHECK_INTERVAL_MS ?? 60 * 60 * 1000);
  const escalationInterval = setInterval(() => {
    void withoutTenant(() => escalationChecker.runOnce(24)).catch((err) => {
      console.error('worker: escalation check failed', err);
    });
  }, ESCALATION_INTERVAL_MS);

  console.log(
    'worker: started (BullMQ resume worker, approval-notify subscriber, escalation checker)',
  );

  const shutdown = async () => {
    clearInterval(escalationInterval);
    await unsubscribeApprovalNotify();
    await resumeWorker.close();
    await resumeQueue.close();
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

function withTenant<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    { companyId, userId: null, sessionId: null, ipAddress: null, isPlatformActor: false },
    async () => await fn(),
  );
}

main().catch((err) => {
  console.error('worker: fatal startup error', err);
  process.exit(1);
});
