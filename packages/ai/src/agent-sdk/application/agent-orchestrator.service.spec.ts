import {
  AgentOrchestratorService,
  AgentNotFoundError,
  AgentDisabledError,
  AgentExecutionNotResumableError,
  type AgentOrchestratorDeps,
} from './agent-orchestrator.service';
import type { ChatCompleteResult } from '../../router/domain/provider-client.port';

const AGENT = {
  id: 'agent-1',
  key: 'test-agent',
  name: 'Test Agent',
  description: 'desc',
  version: 1,
  capabilities: ['test.tool'],
  systemPromptTemplateKey: 'test-agent.system-prompt',
  isBuiltIn: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TOOL = {
  id: 'tool-1',
  key: 'test.tool',
  name: 'Test Tool',
  description: 'desc',
  inputSchema: { type: 'object' },
  requiredPermissionModule: 'test',
  requiredPermissionAction: 'VIEW',
  requiresHumanApproval: false,
  isBuiltIn: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function chatResult(overrides: Partial<ChatCompleteResult> = {}): ChatCompleteResult {
  return {
    content: 'final answer',
    toolCalls: [],
    promptTokens: 1,
    completionTokens: 1,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<AgentOrchestratorDeps> = {}): AgentOrchestratorDeps {
  let executionRow: any = null;
  let toolExecutionRow: any = null;

  const prisma = {
    companyFeature: { findFirst: jest.fn().mockResolvedValue(null) },
    toolExecution: {
      findUnique: jest.fn().mockImplementation(() => Promise.resolve(toolExecutionRow)),
    },
    tool: { findUnique: jest.fn().mockResolvedValue(TOOL) },
    agent: { findUnique: jest.fn().mockResolvedValue(AGENT) },
  };

  const aiRouter = { chatComplete: jest.fn().mockResolvedValue(chatResult()) };
  const prompts = { resolve: jest.fn().mockResolvedValue('You are a test agent.') };
  const agentRegistry = { findByKey: jest.fn().mockResolvedValue(AGENT) };
  const toolRegistry = { findManyByKeys: jest.fn().mockResolvedValue([TOOL]) };

  const executionService = {
    createExecution: jest.fn().mockImplementation((input: any) => {
      executionRow = {
        id: 'exec-1',
        status: 'RUNNING',
        conversationId: input.conversationId,
        agentId: input.agentId,
        pausedState: null,
      };
      return Promise.resolve(executionRow);
    }),
    updateExecution: jest.fn().mockImplementation((id: string, data: any) => {
      executionRow = { ...executionRow, ...data };
      return Promise.resolve(executionRow);
    }),
    findExecution: jest.fn().mockImplementation(() => Promise.resolve(executionRow)),
    createToolExecution: jest.fn().mockImplementation((input: any) => {
      toolExecutionRow = { id: 'tool-exec-1', ...input, approvalRequestId: null };
      return Promise.resolve(toolExecutionRow);
    }),
    updateToolExecution: jest.fn().mockImplementation((id: string, data: any) => {
      toolExecutionRow = { ...toolExecutionRow, ...data };
      return Promise.resolve(toolExecutionRow);
    }),
    createApprovalRequest: jest.fn().mockResolvedValue({ id: 'approval-1', status: 'PENDING' }),
    findApprovalRequest: jest.fn().mockResolvedValue({ id: 'approval-1', status: 'PENDING' }),
    decideApprovalRequest: jest.fn().mockResolvedValue({ id: 'approval-1', status: 'APPROVED' }),
  };

  const conversationService = {
    create: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    findById: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    listMessages: jest.fn().mockResolvedValue([]),
    addMessage: jest.fn().mockResolvedValue({}),
  };

  const permissionChecker = { hasPermission: jest.fn().mockResolvedValue(true) };
  const approvalEvaluator = {
    evaluateApproval: jest.fn().mockResolvedValue({ approvers: [], matchedRuleIds: [] }),
  };
  const toolExecutor = { execute: jest.fn().mockResolvedValue({ ok: true }) };

  return {
    prisma: prisma as never,
    aiRouter: aiRouter as never,
    prompts: prompts as never,
    agentRegistry: agentRegistry as never,
    toolRegistry: toolRegistry as never,
    executionService: executionService as never,
    conversationService: conversationService as never,
    permissionChecker: permissionChecker as never,
    approvalEvaluator: approvalEvaluator as never,
    toolExecutor: toolExecutor as never,
    maxIterations: 4,
    ...overrides,
  };
}

describe('AgentOrchestratorService.run', () => {
  it('throws AgentNotFoundError for an unregistered agent key', async () => {
    const deps = makeDeps({
      agentRegistry: { findByKey: jest.fn().mockResolvedValue(null) } as never,
    });
    const orchestrator = new AgentOrchestratorService(deps);
    await expect(orchestrator.run('unknown', 'company-1', 'user-1', 'hi')).rejects.toThrow(
      AgentNotFoundError,
    );
  });

  it('throws AgentDisabledError when CompanyFeature explicitly disables the agent', async () => {
    const deps = makeDeps({
      prisma: {
        companyFeature: { findFirst: jest.fn().mockResolvedValue({ enabled: false }) },
      } as never,
    });
    const orchestrator = new AgentOrchestratorService(deps);
    await expect(orchestrator.run('test-agent', 'company-1', 'user-1', 'hi')).rejects.toThrow(
      AgentDisabledError,
    );
  });

  it('completes immediately when the model returns a final answer with no tool call', async () => {
    const deps = makeDeps();
    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.run('test-agent', 'company-1', 'user-1', 'hi');

    expect(result.status).toBe('COMPLETED');
    expect(result.output).toEqual({ text: 'final answer' });
    expect(deps.aiRouter.chatComplete).toHaveBeenCalledTimes(1);
  });

  it('executes a no-approval-needed tool call, feeds the result back, and completes on the next model turn', async () => {
    const deps = makeDeps();
    (deps.aiRouter.chatComplete as jest.Mock)
      .mockResolvedValueOnce(
        chatResult({
          content: null,
          toolCalls: [{ id: 'call_1', toolName: 'test.tool', arguments: { x: 1 } }],
        }),
      )
      .mockResolvedValueOnce(chatResult({ content: 'done after tool' }));

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.run('test-agent', 'company-1', 'user-1', 'hi');

    expect(result.status).toBe('COMPLETED');
    expect(result.output).toEqual({ text: 'done after tool' });
    expect(deps.toolExecutor.execute).toHaveBeenCalledWith(
      'test.tool',
      { x: 1 },
      { companyId: 'company-1', userId: 'user-1' },
    );
    expect(deps.executionService.createToolExecution).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'RUNNING', toolId: 'tool-1' }),
    );
    expect(deps.executionService.updateToolExecution).toHaveBeenCalledWith(
      'tool-exec-1',
      expect.objectContaining({ status: 'SUCCEEDED' }),
    );
  });

  it('feeds a permission-denied error back to the model instead of crashing, never calling the tool executor', async () => {
    const deps = makeDeps({
      permissionChecker: { hasPermission: jest.fn().mockResolvedValue(false) } as never,
    });
    (deps.aiRouter.chatComplete as jest.Mock)
      .mockResolvedValueOnce(
        chatResult({
          content: null,
          toolCalls: [{ id: 'call_1', toolName: 'test.tool', arguments: {} }],
        }),
      )
      .mockResolvedValueOnce(chatResult({ content: 'cannot do that' }));

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.run('test-agent', 'company-1', 'user-1', 'hi');

    expect(result.status).toBe('COMPLETED');
    expect(deps.toolExecutor.execute).not.toHaveBeenCalled();
    expect(deps.executionService.createToolExecution).not.toHaveBeenCalled();
    const secondCallMessages = (deps.aiRouter.chatComplete as jest.Mock).mock.calls[1][1].messages;
    expect(secondCallMessages.at(-1).content).toMatch(/do not have permission/i);
  });

  it('feeds an error back for a tool call outside the agent capabilities, never calling the tool executor', async () => {
    const deps = makeDeps();
    (deps.aiRouter.chatComplete as jest.Mock)
      .mockResolvedValueOnce(
        chatResult({
          content: null,
          toolCalls: [{ id: 'call_1', toolName: 'not.a.real.tool', arguments: {} }],
        }),
      )
      .mockResolvedValueOnce(chatResult({ content: 'ok never mind' }));

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.run('test-agent', 'company-1', 'user-1', 'hi');

    expect(result.status).toBe('COMPLETED');
    expect(deps.toolExecutor.execute).not.toHaveBeenCalled();
    const secondCallMessages = (deps.aiRouter.chatComplete as jest.Mock).mock.calls[1][1].messages;
    expect(secondCallMessages.at(-1).content).toMatch(/not available/i);
  });

  it('pauses with AWAITING_APPROVAL and creates a real ApprovalRequest when Tool.requiresHumanApproval is true', async () => {
    const approvalTool = { ...TOOL, requiresHumanApproval: true };
    const deps = makeDeps({
      toolRegistry: { findManyByKeys: jest.fn().mockResolvedValue([approvalTool]) } as never,
    });
    (deps.prisma as any).tool.findUnique.mockResolvedValue(approvalTool);
    (deps.aiRouter.chatComplete as jest.Mock).mockResolvedValueOnce(
      chatResult({
        content: null,
        toolCalls: [{ id: 'call_1', toolName: 'test.tool', arguments: { x: 1 } }],
      }),
    );

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.run('test-agent', 'company-1', 'user-1', 'hi');

    expect(result.status).toBe('AWAITING_APPROVAL');
    expect(deps.toolExecutor.execute).not.toHaveBeenCalled();
    expect(deps.executionService.createApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-1', toolExecutionId: 'tool-exec-1' }),
    );
    expect((result as any).pausedState).toMatchObject({
      toolExecutionId: 'tool-exec-1',
      pendingToolCall: { id: 'call_1', toolName: 'test.tool', arguments: { x: 1 } },
    });
  });

  it('pauses with AWAITING_APPROVAL when the Rules Engine (not the tool itself) requires approvers', async () => {
    const deps = makeDeps({
      approvalEvaluator: {
        evaluateApproval: jest
          .fn()
          .mockResolvedValue({
            approvers: [{ ruleId: 'r1', approverRoleId: 'role-1' }],
            matchedRuleIds: ['r1'],
          }),
      } as never,
    });
    (deps.aiRouter.chatComplete as jest.Mock).mockResolvedValueOnce(
      chatResult({
        content: null,
        toolCalls: [{ id: 'call_1', toolName: 'test.tool', arguments: {} }],
      }),
    );

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.run('test-agent', 'company-1', 'user-1', 'hi');

    expect(result.status).toBe('AWAITING_APPROVAL');
    expect(deps.executionService.createApprovalRequest).toHaveBeenCalledWith(
      expect.objectContaining({ approverRoleId: 'role-1' }),
    );
  });

  it('fails with FAILED status once maxIterations is exceeded without a final answer', async () => {
    const deps = makeDeps({ maxIterations: 2 });
    (deps.aiRouter.chatComplete as jest.Mock).mockResolvedValue(
      chatResult({
        content: null,
        toolCalls: [{ id: 'call_1', toolName: 'test.tool', arguments: {} }],
      }),
    );

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.run('test-agent', 'company-1', 'user-1', 'hi');

    expect(result.status).toBe('FAILED');
    expect((result as any).errorMessage).toMatch(/maximum/i);
  });
});

describe('AgentOrchestratorService.resumeAfterApproval', () => {
  async function pauseAnExecution(deps: AgentOrchestratorDeps) {
    const approvalTool = { ...TOOL, requiresHumanApproval: true };
    (deps.toolRegistry.findManyByKeys as jest.Mock).mockResolvedValue([approvalTool]);
    (deps.prisma as any).tool.findUnique.mockResolvedValue(approvalTool);
    (deps.aiRouter.chatComplete as jest.Mock).mockResolvedValueOnce(
      chatResult({
        content: null,
        toolCalls: [{ id: 'call_1', toolName: 'test.tool', arguments: { x: 1 } }],
      }),
    );
    const orchestrator = new AgentOrchestratorService(deps);
    const paused = await orchestrator.run('test-agent', 'company-1', 'user-1', 'hi');
    (deps.prisma as any).toolExecution.findUnique.mockResolvedValue({
      id: 'tool-exec-1',
      toolId: 'tool-1',
      approvalRequestId: 'approval-1',
      status: 'AWAITING_APPROVAL',
    });
    return { orchestrator, paused };
  }

  it('throws AgentExecutionNotResumableError when the execution is not AWAITING_APPROVAL', async () => {
    const deps = makeDeps();
    (deps.executionService.findExecution as jest.Mock).mockResolvedValue({
      id: 'exec-1',
      status: 'COMPLETED',
    });
    const orchestrator = new AgentOrchestratorService(deps);
    await expect(
      orchestrator.resumeAfterApproval('exec-1', 'company-1', 'APPROVED', 'user-1'),
    ).rejects.toThrow(AgentExecutionNotResumableError);
  });

  it('on APPROVED: executes the staged tool call for real, then continues the loop to completion', async () => {
    const deps = makeDeps();
    await pauseAnExecution(deps);
    (deps.aiRouter.chatComplete as jest.Mock).mockResolvedValueOnce(
      chatResult({ content: 'done after approval' }),
    );

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.resumeAfterApproval(
      'exec-1',
      'company-1',
      'APPROVED',
      'approver-1',
    );

    expect(deps.executionService.decideApprovalRequest).toHaveBeenCalledWith(
      'approval-1',
      'APPROVED',
      undefined,
    );
    expect(deps.toolExecutor.execute).toHaveBeenCalledWith(
      'test.tool',
      { x: 1 },
      { companyId: 'company-1', userId: 'approver-1' },
    );
    expect(deps.executionService.updateToolExecution).toHaveBeenCalledWith(
      'tool-exec-1',
      expect.objectContaining({ status: 'SUCCEEDED' }),
    );
    expect(result.status).toBe('COMPLETED');
    expect(result.output).toEqual({ text: 'done after approval' });
  });

  it('on REJECTED: marks the ToolExecution REJECTED, makes one final model call, and always ends CANCELLED', async () => {
    const deps = makeDeps();
    await pauseAnExecution(deps);
    (deps.aiRouter.chatComplete as jest.Mock).mockResolvedValueOnce(
      chatResult({ content: 'understood, stopping' }),
    );

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.resumeAfterApproval(
      'exec-1',
      'company-1',
      'REJECTED',
      'approver-1',
      'not authorized',
    );

    expect(deps.executionService.decideApprovalRequest).toHaveBeenCalledWith(
      'approval-1',
      'REJECTED',
      'not authorized',
    );
    expect(deps.toolExecutor.execute).not.toHaveBeenCalled();
    expect(deps.executionService.updateToolExecution).toHaveBeenCalledWith('tool-exec-1', {
      status: 'REJECTED',
    });
    expect(result.status).toBe('CANCELLED');
  });

  it('on REJECTED: ends CANCELLED even if the model tries to call another tool in its final turn', async () => {
    const deps = makeDeps();
    await pauseAnExecution(deps);
    (deps.aiRouter.chatComplete as jest.Mock).mockResolvedValueOnce(
      chatResult({
        content: null,
        toolCalls: [{ id: 'call_2', toolName: 'test.tool', arguments: {} }],
      }),
    );

    const orchestrator = new AgentOrchestratorService(deps);
    const result = await orchestrator.resumeAfterApproval(
      'exec-1',
      'company-1',
      'REJECTED',
      'approver-1',
    );

    expect(result.status).toBe('CANCELLED');
    expect(deps.toolExecutor.execute).not.toHaveBeenCalled();
  });
});
