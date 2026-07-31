import type { TenantScopedPrismaClient, AgentExecution, MessageRole } from '@platform/database';
import type { PermissionAction } from '@platform/types';
import type { AiRouter } from '../../router/application/ai-router.service';
import type { PromptTemplateService } from '../../prompt-engine/application/prompt-template.service';
import type { ChatMessage, ToolSchema } from '../../router/domain/provider-client.port';
import {
  interpretModelResponse,
  appendAssistantToolCallMessage,
  appendToolResultMessage,
  hasReachedIterationLimit,
  type PausedAgentLoopState,
} from '../domain/agent-loop';
import type { ApprovalEvaluator } from '../domain/ports/policy-engine.port';
import type { PermissionChecker } from '../domain/ports/tool-permission.port';
import type { ToolExecutor } from '../domain/ports/tool-executor.port';
import type { AgentRegistryService } from './agent-registry.service';
import type { ToolRegistryService } from './tool-registry.service';
import type { AgentExecutionService } from './agent-execution.service';
import type { ConversationService } from './conversation.service';

export interface AgentOrchestratorDeps {
  prisma: TenantScopedPrismaClient;
  aiRouter: AiRouter;
  prompts: PromptTemplateService;
  agentRegistry: AgentRegistryService;
  toolRegistry: ToolRegistryService;
  executionService: AgentExecutionService;
  conversationService: ConversationService;
  permissionChecker: PermissionChecker;
  approvalEvaluator: ApprovalEvaluator;
  toolExecutor: ToolExecutor;
  maxIterations?: number;
  now?: () => Date;
}

export class AgentDisabledError extends Error {
  constructor(agentKey: string) {
    super(`Agent "${agentKey}" is disabled for this company.`);
    this.name = 'AgentDisabledError';
  }
}

export class AgentNotFoundError extends Error {
  constructor(agentKey: string) {
    super(`No agent registered with key "${agentKey}".`);
    this.name = 'AgentNotFoundError';
  }
}

export class AgentExecutionNotResumableError extends Error {
  constructor(id: string, status: string) {
    super(`AgentExecution ${id} is not awaiting approval (status: ${status}).`);
    this.name = 'AgentExecutionNotResumableError';
  }
}

const TOOL_NOT_AVAILABLE = (toolName: string) =>
  `Tool "${toolName}" is not available to this agent.`;
const TOOL_PERMISSION_DENIED = (toolName: string) =>
  `You do not have permission to use the tool "${toolName}".`;
const TOOL_REJECTED_MESSAGE = 'This action was reviewed and rejected by a human approver.';

/**
 * Low, not zero: empirically, small local models (qwen2.5:3b via Ollama) intermittently skip a
 * clearly-instructed tool call and answer in text instead at default sampling temperature —
 * observed directly in ai-agents-tool-calling.e2e-spec.ts. Tool selection benefits from
 * deterministic instruction-following more than from response variety.
 */
const AGENT_LOOP_TEMPERATURE = 0.2;

/**
 * The pause/resume tool-calling loop — see docs/DOMAIN_MODEL_PHASE6.md §10-12. Nothing in
 * Phases 1-5 pauses/resumes mid-service-call across an HTTP request boundary; this is the one
 * genuinely novel piece of architecture this phase adds. `run()`/`resumeAfterApproval()` are
 * the only two public entry points — everything else is a private step of the same loop.
 */
export class AgentOrchestratorService {
  private readonly maxIterations: number;
  private readonly now: () => Date;

  constructor(private readonly deps: AgentOrchestratorDeps) {
    this.maxIterations = deps.maxIterations ?? 8;
    this.now = deps.now ?? (() => new Date());
  }

  async run(
    agentKey: string,
    companyId: string,
    userId: string,
    userMessage: string,
    conversationId?: string,
  ): Promise<AgentExecution> {
    const start = this.now().getTime();
    const agent = await this.deps.agentRegistry.findByKey(agentKey);
    if (!agent) throw new AgentNotFoundError(agentKey);

    const feature = await this.deps.prisma.companyFeature.findFirst({
      where: { moduleName: `ai:${agentKey}` },
    });
    if (feature && !feature.enabled) throw new AgentDisabledError(agentKey);

    const conversation = conversationId
      ? await this.deps.conversationService.findById(conversationId)
      : await this.deps.conversationService.create({
          companyId,
          agentId: agent.id,
          subjectType: 'user',
          subjectId: userId,
        });
    const resolvedConversationId = conversation!.id;

    const history = await this.deps.conversationService.listMessages(resolvedConversationId);
    const systemPrompt = await this.deps.prompts.resolve(agent.systemPromptTemplateKey);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m): ChatMessage => ({ role: roleToChatRole(m.role), content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const execution = await this.deps.executionService.createExecution({
      companyId,
      agentId: agent.id,
      conversationId: resolvedConversationId,
      requestedByUserId: userId,
      input: { userMessage, conversationId: resolvedConversationId },
    });
    await this.deps.conversationService.addMessage(resolvedConversationId, 'USER', userMessage);

    const capabilities = Array.isArray(agent.capabilities) ? (agent.capabilities as string[]) : [];
    const tools = await this.deps.toolRegistry.findManyByKeys(capabilities);

    return this.runLoop({
      execution,
      companyId,
      userId,
      conversationId: resolvedConversationId,
      tools,
      messages,
      iteration: 0,
      startedAt: start,
    });
  }

  async resumeAfterApproval(
    agentExecutionId: string,
    companyId: string,
    decision: 'APPROVED' | 'REJECTED',
    actorUserId: string,
    comment?: string,
  ): Promise<AgentExecution> {
    const start = this.now().getTime();
    const execution = await this.deps.executionService.findExecution(agentExecutionId);
    if (!execution) throw new AgentExecutionNotResumableError(agentExecutionId, 'NOT_FOUND');
    if (execution.status !== 'AWAITING_APPROVAL') {
      throw new AgentExecutionNotResumableError(agentExecutionId, execution.status);
    }
    const pausedState = execution.pausedState as unknown as PausedAgentLoopState;
    const toolExecutionId = (execution.pausedState as unknown as { toolExecutionId: string })
      .toolExecutionId;
    const toolExecution = await this.mustFindToolExecution(toolExecutionId);
    const tool = await this.mustFindTool(toolExecution.toolId);

    if (!toolExecution.approvalRequestId) {
      throw new Error(`ToolExecution ${toolExecutionId} has no associated ApprovalRequest.`);
    }
    await this.deps.executionService.decideApprovalRequest(
      toolExecution.approvalRequestId,
      decision,
      comment,
    );

    const agent = await this.mustFindAgentById(execution.agentId);
    const capabilities = Array.isArray(agent.capabilities) ? (agent.capabilities as string[]) : [];
    const tools = await this.deps.toolRegistry.findManyByKeys(capabilities);

    if (decision === 'REJECTED') {
      await this.deps.executionService.updateToolExecution(toolExecutionId, { status: 'REJECTED' });
      const messagesWithRejection = appendToolResultMessage(
        appendAssistantToolCallMessage(
          pausedState.messages,
          pausedState.pendingToolCall,
          pausedState.pendingToolCallRawContent,
        ),
        pausedState.pendingToolCall,
        TOOL_REJECTED_MESSAGE,
      );
      const finalResult = await this.deps.aiRouter.chatComplete(
        companyId,
        {
          messages: messagesWithRejection,
          tools: tools.map(toToolSchema),
          temperature: AGENT_LOOP_TEMPERATURE,
        },
        { purpose: 'agent_tool_loop', requestedByUserId: actorUserId, agentExecutionId },
      );
      const finalText = finalResult.content ?? TOOL_REJECTED_MESSAGE;
      await this.deps.conversationService.addMessage(
        execution.conversationId ?? '',
        'ASSISTANT',
        finalText,
      );
      return this.deps.executionService.updateExecution(agentExecutionId, {
        status: 'CANCELLED',
        output: { text: finalText },
        pausedState: null,
        durationMs: this.now().getTime() - start,
      });
    }

    // APPROVED: execute the previously-staged tool call for real, then continue the loop.
    const toolResult = await this.executeToolSafely(
      tool.key,
      pausedState.pendingToolCall.arguments,
      companyId,
      actorUserId,
    );
    await this.deps.executionService.updateToolExecution(toolExecutionId, {
      status: toolResult.ok ? 'SUCCEEDED' : 'FAILED',
      output: toolResult.ok ? (toolResult.value as object) : undefined,
      errorMessage: toolResult.ok ? undefined : toolResult.error,
    });
    const messagesAfterExecution = appendToolResultMessage(
      appendAssistantToolCallMessage(
        pausedState.messages,
        pausedState.pendingToolCall,
        pausedState.pendingToolCallRawContent,
      ),
      pausedState.pendingToolCall,
      JSON.stringify(toolResult.ok ? toolResult.value : { error: toolResult.error }),
    );

    return this.runLoop({
      execution,
      companyId,
      userId: actorUserId,
      conversationId: execution.conversationId ?? undefined,
      tools,
      messages: messagesAfterExecution,
      iteration: pausedState.iteration + 1,
      startedAt: start,
    });
  }

  private async runLoop(ctx: {
    execution: AgentExecution;
    companyId: string;
    userId: string;
    conversationId: string | undefined;
    tools: Array<{
      key: string;
      id: string;
      inputSchema: unknown;
      name: string;
      description: string;
      requiredPermissionModule: string;
      requiredPermissionAction: string;
      requiresHumanApproval: boolean;
    }>;
    messages: ChatMessage[];
    iteration: number;
    startedAt: number;
  }): Promise<AgentExecution> {
    let { messages, iteration } = ctx;
    const { execution, companyId, userId, conversationId, tools } = ctx;
    const toolSchemas = tools.map(toToolSchema);

    while (true) {
      if (hasReachedIterationLimit(iteration, this.maxIterations)) {
        return this.deps.executionService.updateExecution(execution.id, {
          status: 'FAILED',
          errorMessage: `Agent exceeded the maximum of ${this.maxIterations} tool-calling iterations.`,
          durationMs: this.now().getTime() - ctx.startedAt,
        });
      }

      const result = await this.deps.aiRouter.chatComplete(
        companyId,
        { messages, tools: toolSchemas, temperature: AGENT_LOOP_TEMPERATURE },
        { purpose: 'agent_tool_loop', requestedByUserId: userId, agentExecutionId: execution.id },
      );
      const interpreted = interpretModelResponse(result);

      if (interpreted.kind === 'FINAL_ANSWER') {
        if (conversationId) {
          await this.deps.conversationService.addMessage(
            conversationId,
            'ASSISTANT',
            interpreted.text,
          );
        }
        return this.deps.executionService.updateExecution(execution.id, {
          status: 'COMPLETED',
          output: { text: interpreted.text },
          durationMs: this.now().getTime() - ctx.startedAt,
        });
      }

      const { toolCall } = interpreted;
      const tool = tools.find((t) => t.key === toolCall.toolName);

      if (!tool) {
        messages = appendToolResultMessage(
          appendAssistantToolCallMessage(messages, toolCall, result.content),
          toolCall,
          TOOL_NOT_AVAILABLE(toolCall.toolName),
        );
        iteration += 1;
        continue;
      }

      // Prisma's generated PermissionAction (Tool.requiredPermissionAction's read-back type)
      // and @platform/types' hand-written PermissionAction are structurally identical but
      // nominally distinct TS types — same underlying schema.prisma enum, two declarations.
      const permitted = await this.deps.permissionChecker.hasPermission(
        userId,
        tool.requiredPermissionModule,
        tool.requiredPermissionAction as unknown as PermissionAction,
      );
      if (!permitted) {
        messages = appendToolResultMessage(
          appendAssistantToolCallMessage(messages, toolCall, result.content),
          toolCall,
          TOOL_PERMISSION_DENIED(toolCall.toolName),
        );
        iteration += 1;
        continue;
      }

      const approval = await this.deps.approvalEvaluator.evaluateApproval(companyId, 'ai', {
        toolKey: tool.key,
        ...toolCall.arguments,
      });
      const needsApproval = tool.requiresHumanApproval || approval.approvers.length > 0;

      if (needsApproval) {
        const toolExecution = await this.deps.executionService.createToolExecution({
          agentExecutionId: execution.id,
          toolId: tool.id,
          status: 'AWAITING_APPROVAL',
          input: toolCall.arguments,
        });
        const firstApprover = approval.approvers[0];
        const approvalRequest = await this.deps.executionService.createApprovalRequest({
          companyId,
          toolExecutionId: toolExecution.id,
          approverUserId:
            typeof firstApprover?.approverUserId === 'string'
              ? firstApprover.approverUserId
              : undefined,
          approverRoleId:
            typeof firstApprover?.approverRoleId === 'string'
              ? firstApprover.approverRoleId
              : undefined,
        });
        await this.deps.executionService.updateToolExecution(toolExecution.id, {
          approvalRequestId: approvalRequest.id,
        });

        const pausedState: PausedAgentLoopState & { toolExecutionId: string } = {
          messages,
          iteration,
          pendingToolCall: toolCall,
          pendingToolCallRawContent: result.content,
          toolExecutionId: toolExecution.id,
        };
        return this.deps.executionService.updateExecution(execution.id, {
          status: 'AWAITING_APPROVAL',
          pausedState,
          durationMs: this.now().getTime() - ctx.startedAt,
        });
      }

      const toolExecution = await this.deps.executionService.createToolExecution({
        agentExecutionId: execution.id,
        toolId: tool.id,
        status: 'RUNNING',
        input: toolCall.arguments,
      });
      const toolResult = await this.executeToolSafely(
        tool.key,
        toolCall.arguments,
        companyId,
        userId,
      );
      await this.deps.executionService.updateToolExecution(toolExecution.id, {
        status: toolResult.ok ? 'SUCCEEDED' : 'FAILED',
        output: toolResult.ok ? (toolResult.value as object) : undefined,
        errorMessage: toolResult.ok ? undefined : toolResult.error,
      });

      messages = appendToolResultMessage(
        appendAssistantToolCallMessage(messages, toolCall, result.content),
        toolCall,
        JSON.stringify(toolResult.ok ? toolResult.value : { error: toolResult.error }),
      );
      iteration += 1;
    }
  }

  private async executeToolSafely(
    toolKey: string,
    input: Record<string, unknown>,
    companyId: string,
    userId: string,
  ): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
    try {
      const value = await this.deps.toolExecutor.execute(toolKey, input, { companyId, userId });
      return { ok: true, value };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async mustFindToolExecution(id: string) {
    const toolExecution = await this.deps.prisma.toolExecution.findUnique({ where: { id } });
    if (!toolExecution) throw new Error(`ToolExecution ${id} not found.`);
    return toolExecution;
  }

  private async mustFindTool(id: string) {
    const tool = await this.deps.prisma.tool.findUnique({ where: { id } });
    if (!tool) throw new Error(`Tool ${id} not found.`);
    return tool;
  }

  private async mustFindAgentById(id: string) {
    const agent = await this.deps.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new Error(`Agent ${id} not found.`);
    return agent;
  }
}

function roleToChatRole(role: MessageRole): ChatMessage['role'] {
  switch (role) {
    case 'SYSTEM':
      return 'system';
    case 'USER':
      return 'user';
    case 'ASSISTANT':
      return 'assistant';
    case 'TOOL':
      return 'tool';
  }
}

function toToolSchema(tool: {
  key: string;
  name: string;
  description: string;
  inputSchema: unknown;
}): ToolSchema {
  return {
    name: tool.key,
    description: tool.description,
    parameters: (tool.inputSchema as Record<string, unknown>) ?? {},
  };
}
