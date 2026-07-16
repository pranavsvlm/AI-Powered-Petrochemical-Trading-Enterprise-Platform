import type { RedisStreamsEventBus } from '@platform/event-bus';
import { EVENT_TYPES } from '@platform/event-bus';
import type { AiDecisionProvider } from '../domain/ports/ai-decision-provider.port';
import type {
  NotificationClientPort,
  WorkflowClientPort,
} from '../domain/ports/rules-engine-clients.port';
import type {
  ActionExecutionResult,
  RuleActionDef,
  RuleEvaluationContext,
} from '../domain/rule-types';

export interface RuleActionExecutorDeps {
  eventBus: RedisStreamsEventBus;
  aiDecisionProvider: AiDecisionProvider;
  workflowClient?: WorkflowClientPort;
  notificationClient?: NotificationClientPort;
  fetchImpl?: typeof fetch;
}

/**
 * Executes a single resolved RuleAction. Each action type is a real, typed handler.
 * GENERATE_TASK publishes an event rather than writing to a (nonexistent) Task table.
 * EXECUTE_WORKFLOW and NOTIFY call the injected public-API ports of the workflow/notification
 * packages, never their internals. CALL_AI always throws via the documented seam.
 */
export class RuleActionExecutor {
  constructor(private readonly deps: RuleActionExecutorDeps) {}

  async execute(
    ruleId: string,
    action: RuleActionDef,
    context: RuleEvaluationContext,
    isSimulation: boolean,
  ): Promise<ActionExecutionResult> {
    try {
      const output = await this.dispatch(ruleId, action, context, isSimulation);
      return { type: action.type, ruleId, success: true, output };
    } catch (err) {
      return {
        type: action.type,
        ruleId,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async dispatch(
    ruleId: string,
    action: RuleActionDef,
    context: RuleEvaluationContext,
    isSimulation: boolean,
  ): Promise<unknown> {
    switch (action.type) {
      case 'ALLOW':
      case 'BLOCK':
      case 'WARN':
        return { message: action.params.message ?? action.type };

      case 'REQUEST_APPROVAL':
        // The actual approver-chain resolution lives in ApprovalRuleSource /
        // RuleEvaluationService.evaluateApproval — this action just records intent.
        return { requested: true, approverRoleId: action.params.approverRoleId };

      case 'GENERATE_TASK': {
        if (isSimulation) return { simulated: true, event: EVENT_TYPES.TASK_GENERATION_REQUESTED };
        const envelope = await this.deps.eventBus.publish(
          EVENT_TYPES.TASK_GENERATION_REQUESTED,
          context.companyId,
          {
            ruleId,
            companyId: context.companyId,
            assigneeUserId: action.params.assigneeUserId,
            assigneeTeamId: action.params.assigneeTeamId,
            title: action.params.title,
            description: action.params.description,
            dueDate: action.params.dueDate,
            sourceModule: context.module,
            sourceEntityId: action.params.sourceEntityId,
          },
          '@platform/rules-engine',
        );
        return { eventId: envelope.eventId };
      }

      case 'EXECUTE_WORKFLOW': {
        if (isSimulation) return { simulated: true };
        if (!this.deps.workflowClient) throw new Error('No WorkflowClientPort configured.');
        return this.deps.workflowClient.startWorkflow({
          workflowId: String(action.params.workflowId),
          companyId: context.companyId,
          context: context.attributes,
        });
      }

      case 'NOTIFY': {
        if (isSimulation) return { simulated: true };
        if (!this.deps.notificationClient) throw new Error('No NotificationClientPort configured.');
        return this.deps.notificationClient.notify({
          companyId: context.companyId,
          recipientUserId: String(action.params.recipientUserId),
          title: String(action.params.title ?? 'Rule notification'),
          body: String(action.params.body ?? ''),
          category: String(action.params.category ?? 'RULE_ENGINE'),
          priority: action.params.priority as string | undefined,
        });
      }

      case 'CALL_AI':
        return this.deps.aiDecisionProvider.decide({
          ruleId,
          module: context.module,
          attributes: context.attributes,
        });

      case 'CALL_API': {
        if (isSimulation) return { simulated: true, url: action.params.url };
        const fetchFn = this.deps.fetchImpl ?? fetch;
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          Number(action.params.timeoutMs ?? 5000),
        );
        try {
          const res = await fetchFn(String(action.params.url), {
            method: String(action.params.method ?? 'POST'),
            headers: { 'content-type': 'application/json' },
            body: action.params.body ? JSON.stringify(action.params.body) : undefined,
            signal: controller.signal,
          });
          return { status: res.status, ok: res.ok };
        } finally {
          clearTimeout(timeout);
        }
      }

      default:
        throw new Error(`Unknown rule action type: ${(action as RuleActionDef).type}`);
    }
  }
}
