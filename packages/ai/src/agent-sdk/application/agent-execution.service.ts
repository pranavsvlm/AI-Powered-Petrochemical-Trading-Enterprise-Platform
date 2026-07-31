import { Prisma } from '@platform/database';
import type {
  TenantScopedPrismaClient,
  Agent,
  AgentExecution,
  AgentExecutionStatus,
  ApprovalRequest,
  Tool,
  ToolExecution,
  ToolExecutionStatus,
} from '@platform/database';

/** `AgentExecution` plus its resolved `agent` — what list views need without a per-row lookup. */
export interface AgentExecutionWithAgent extends AgentExecution {
  agent: Agent;
}

/** `AgentExecutionWithAgent` plus the full ordered `toolExecutions` (each with its `tool`) — the audit trail a detail view renders. */
export interface AgentExecutionWithTrail extends AgentExecutionWithAgent {
  toolExecutions: Array<ToolExecution & { tool: Tool }>;
}

export interface CreateAgentExecutionInput {
  companyId: string;
  agentId: string;
  conversationId?: string;
  requestedByUserId: string;
  input: unknown;
}

export interface UpdateAgentExecutionInput {
  status?: AgentExecutionStatus;
  output?: unknown;
  pausedState?: unknown | null;
  errorMessage?: string;
  totalTokens?: number;
  totalCostUsd?: number;
  durationMs?: number;
}

export interface CreateToolExecutionInput {
  agentExecutionId: string;
  toolId: string;
  status: ToolExecutionStatus;
  input: unknown;
}

export interface UpdateToolExecutionInput {
  status?: ToolExecutionStatus;
  output?: unknown;
  approvalRequestId?: string;
  errorMessage?: string;
  durationMs?: number;
}

/**
 * CRUD for AgentExecution/ToolExecution plus the ApprovalRequest pair every human-approval
 * gate in this codebase uses (requestApproval-shaped create + decideApproval-shaped update) —
 * reuses the existing polymorphic ApprovalRequest table (entityType: 'ToolExecution') rather
 * than a second approval system. See docs/DOMAIN_MODEL_PHASE6.md §10.
 */
export class AgentExecutionService {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  createExecution(input: CreateAgentExecutionInput): Promise<AgentExecution> {
    return this.prisma.agentExecution.create({
      data: {
        companyId: input.companyId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        requestedByUserId: input.requestedByUserId,
        status: 'RUNNING',
        input: input.input as Prisma.InputJsonValue,
      },
    });
  }

  updateExecution(id: string, data: UpdateAgentExecutionInput): Promise<AgentExecution> {
    return this.prisma.agentExecution.update({
      where: { id },
      data: {
        status: data.status,
        output: data.output === undefined ? undefined : (data.output as Prisma.InputJsonValue),
        pausedState:
          data.pausedState === undefined
            ? undefined
            : data.pausedState === null
              ? Prisma.DbNull
              : (data.pausedState as Prisma.InputJsonValue),
        errorMessage: data.errorMessage,
        totalTokens: data.totalTokens,
        totalCostUsd: data.totalCostUsd,
        durationMs: data.durationMs,
      },
    });
  }

  /**
   * Includes `agent` + the full `toolExecutions` (with their `tool`) trail — the UI's execution
   * detail page needs both to render "which agent" and the tool-call audit trail without a
   * second round trip.
   */
  findExecution(id: string): Promise<AgentExecutionWithTrail | null> {
    return this.prisma.agentExecution.findUnique({
      where: { id },
      include: {
        agent: true,
        toolExecutions: { include: { tool: true }, orderBy: { createdAt: 'asc' } },
      },
    }) as Promise<AgentExecutionWithTrail | null>;
  }

  /** Includes `agent` (name/key) so list rows don't need a per-row lookup. */
  listExecutions(
    filters: { agentId?: string; status?: AgentExecutionStatus } = {},
  ): Promise<AgentExecutionWithAgent[]> {
    return this.prisma.agentExecution.findMany({
      where: { agentId: filters.agentId, status: filters.status },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { agent: true },
    }) as Promise<AgentExecutionWithAgent[]>;
  }

  createToolExecution(input: CreateToolExecutionInput): Promise<ToolExecution> {
    return this.prisma.toolExecution.create({
      data: {
        agentExecutionId: input.agentExecutionId,
        toolId: input.toolId,
        status: input.status,
        input: input.input as Prisma.InputJsonValue,
      },
    });
  }

  updateToolExecution(id: string, data: UpdateToolExecutionInput): Promise<ToolExecution> {
    return this.prisma.toolExecution.update({
      where: { id },
      data: {
        status: data.status,
        output: data.output === undefined ? undefined : (data.output as Prisma.InputJsonValue),
        approvalRequestId: data.approvalRequestId,
        errorMessage: data.errorMessage,
        durationMs: data.durationMs,
      },
    });
  }

  createApprovalRequest(input: {
    companyId: string;
    toolExecutionId: string;
    ruleExecutionId?: string;
    approverUserId?: string;
    approverRoleId?: string;
  }): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.create({
      data: {
        companyId: input.companyId,
        entityType: 'ToolExecution',
        entityId: input.toolExecutionId,
        ruleExecutionId: input.ruleExecutionId,
        approverUserId: input.approverUserId,
        approverRoleId: input.approverRoleId,
      },
    });
  }

  findApprovalRequest(id: string): Promise<ApprovalRequest | null> {
    return this.prisma.approvalRequest.findUnique({ where: { id } });
  }

  decideApprovalRequest(
    id: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
  ): Promise<ApprovalRequest> {
    return this.prisma.approvalRequest.update({
      where: { id },
      data: { status: decision, decidedAt: new Date(), comment },
    });
  }
}
