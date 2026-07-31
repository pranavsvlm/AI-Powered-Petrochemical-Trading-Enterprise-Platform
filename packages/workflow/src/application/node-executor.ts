import { evaluateCondition, type ConditionNode } from '@platform/permissions';
import type { RuleEvaluationService } from '@platform/rules-engine';
import { getPrismaClient, type TenantScopedPrismaClient } from '@platform/database';
import type { GraphNode } from '../domain/workflow-graph';
import type { DocumentGeneratorPort } from '../domain/ports/document-generator.port';
import type {
  NotificationClientPort,
  AiDecisionProviderPort,
} from '../domain/ports/workflow-clients.port';
import { assertWhitelistedModel } from '../infrastructure/database-node-whitelist';

export interface NodeExecutorDeps {
  prisma?: TenantScopedPrismaClient;
  rulesEngine: RuleEvaluationService;
  notificationClient?: NotificationClientPort;
  documentGenerator: DocumentGeneratorPort;
  aiDecisionProvider: AiDecisionProviderPort;
  fetchImpl?: typeof fetch;
  enqueueDelay: (executionId: string, resumeAt: Date) => Promise<void>;
}

export interface NodeExecutionResult {
  /** Key of the outgoing edge branch to follow, e.g. "true"/"false" for CONDITION, or undefined for the default single edge. */
  branch?: string;
  waiting?: boolean;
  output?: unknown;
}

/**
 * Executes a single workflow node. In simulation mode, side-effecting nodes (API,
 * DATABASE, NOTIFICATION) are logged/mocked instead of actually called, satisfying the
 * "dry-run without side effects" requirement.
 */
export class NodeExecutor {
  constructor(private readonly deps: NodeExecutorDeps) {}

  async execute(
    node: GraphNode,
    context: Record<string, unknown>,
    executionId: string,
    companyId: string,
    isSimulation: boolean,
  ): Promise<NodeExecutionResult> {
    const prisma = this.deps.prisma ?? getPrismaClient();

    switch (node.type) {
      case 'START':
        return {};

      case 'END':
        return {};

      case 'CONDITION': {
        const cond = node.config.condition as ConditionNode;
        const result = evaluateCondition(cond, context as never);
        return { branch: result ? 'true' : 'false', output: { result } };
      }

      case 'AI_DECISION': {
        // Always throws NotImplementedInPhaseError via the injected seam — documented,
        // not silently skipped.
        const result = await this.deps.aiDecisionProvider.decide({
          ruleId: `workflow-node:${node.id}`,
          companyId,
          module: String(node.config.module ?? 'workflow'),
          attributes: context,
        });
        return { output: result };
      }

      case 'APPROVAL': {
        // Delegates entirely to the Rules Engine's approval-rule resolution — does not
        // reimplement approval logic.
        const resolution = await this.deps.rulesEngine.evaluateApproval(
          companyId,
          String(node.config.module ?? 'workflow'),
          context,
        );
        if (isSimulation) return { output: { simulated: true, resolution }, waiting: false };

        for (const approver of resolution.approvers) {
          await prisma.workflowApproval.create({
            data: {
              executionId,
              nodeId: node.id,
              approverRoleId: (approver as { approverRoleId?: string }).approverRoleId,
              level: Number(node.config.level ?? 1),
              status: 'PENDING',
            },
          });
        }
        return { output: resolution, waiting: resolution.approvers.length > 0 };
      }

      case 'TASK': {
        if (isSimulation) return { output: { simulated: true } };
        const task = await prisma.workflowTask.create({
          data: {
            executionId,
            nodeId: node.id,
            assigneeUserId: node.config.assigneeUserId as string | undefined,
            assigneeTeamId: node.config.assigneeTeamId as string | undefined,
            title: String(node.config.title ?? node.key),
            dueDate: node.config.dueDate ? new Date(String(node.config.dueDate)) : undefined,
          },
        });
        return { output: { taskId: task.id }, waiting: node.config.blocking !== false };
      }

      case 'NOTIFICATION': {
        if (isSimulation || !this.deps.notificationClient) {
          return { output: { simulated: true } };
        }
        const result = await this.deps.notificationClient.notify({
          companyId,
          recipientUserId: String(node.config.recipientUserId),
          title: String(node.config.title ?? 'Workflow notification'),
          body: String(node.config.body ?? ''),
          category: String(node.config.category ?? 'WORKFLOW'),
          priority: node.config.priority as string | undefined,
        });
        return { output: result };
      }

      case 'API': {
        if (isSimulation) return { output: { simulated: true, url: node.config.url } };
        const fetchFn = this.deps.fetchImpl ?? fetch;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Number(node.config.timeoutMs ?? 5000));
        try {
          const res = await fetchFn(String(node.config.url), {
            method: String(node.config.method ?? 'POST'),
            headers: { 'content-type': 'application/json' },
            body: node.config.body ? JSON.stringify(node.config.body) : undefined,
            signal: controller.signal,
          });
          return { output: { status: res.status, ok: res.ok } };
        } finally {
          clearTimeout(timeout);
        }
      }

      case 'DOCUMENT': {
        if (isSimulation) return { output: { simulated: true } };
        const doc = await this.deps.documentGenerator.generate(
          node.config.template as never,
          context,
        );
        return { output: { filename: doc.filename, sizeBytes: doc.buffer.length } };
      }

      case 'DATABASE': {
        const model = String(node.config.model);
        assertWhitelistedModel(model);
        if (isSimulation)
          return { output: { simulated: true, model, operation: node.config.operation } };
        const delegate = (
          prisma as unknown as Record<
            string,
            { create: (a: unknown) => Promise<unknown>; update: (a: unknown) => Promise<unknown> }
          >
        )[model]!;
        const operation = String(node.config.operation ?? 'create');
        if (operation === 'update') {
          const result = await delegate.update({
            where: node.config.where,
            data: node.config.data,
          });
          return { output: result };
        }
        const result = await delegate.create({ data: node.config.data });
        return { output: result };
      }

      case 'DELAY': {
        const resumeAt = new Date(Date.now() + Number(node.config.delayMs ?? 0));
        if (!isSimulation) {
          await this.deps.enqueueDelay(executionId, resumeAt);
        }
        return { waiting: !isSimulation, output: { resumeAt: resumeAt.toISOString() } };
      }

      default:
        throw new Error(`Unknown workflow node type: ${(node as GraphNode).type}`);
    }
  }
}
