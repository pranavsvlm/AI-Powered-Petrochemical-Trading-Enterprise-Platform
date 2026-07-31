import type { OnModuleInit } from '@nestjs/common';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type {
  Agent,
  AgentExecution,
  AgentExecutionStatus,
  AiProviderConfig,
  AiProviderKind,
  Memory,
  MemoryScopeType,
} from '@platform/database';
import {
  AGENT_DEFINITIONS,
  TOOL_DEFINITIONS,
  AgentDisabledError,
  AgentExecutionNotResumableError,
  AgentNotFoundError,
  type AgentExecutionService,
  type AgentOrchestratorService,
  type AgentRegistryService,
  type AiProviderConfigRepository,
  type MemoryService,
  type ToolRegistryService,
  type UpsertAiProviderConfigInput,
} from '@platform/ai';

/**
 * Thin NestJS-idiomatic façade over packages/ai's Agent SDK — the real domain logic lives in
 * the generic, reusable engine (packages/ai), mirroring how packages/rules-engine/
 * packages/workflow hold the real logic while apps/backend/src/modules/{rules,workflows} are
 * thin controller shells. This adds only error mapping to NestJS HTTP exceptions.
 *
 * Also owns the code-defined Agent/Tool registry sync on boot (OnModuleInit) — deliberately
 * implemented here rather than on the AiModule class: Nest only invokes lifecycle hooks on
 * provider instances held in the DI container (useClass/useFactory/useValue), never on the
 * @Module()-decorated class itself, even if that class declares a constructor and implements
 * OnModuleInit.
 */
export class AiFacadeService implements OnModuleInit {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly executionService: AgentExecutionService,
    private readonly memoryService: MemoryService,
    private readonly providerConfigRepo: AiProviderConfigRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.agentRegistry.sync(AGENT_DEFINITIONS);
    await this.toolRegistry.sync(TOOL_DEFINITIONS);
  }

  listAgents(): Promise<Agent[]> {
    return this.agentRegistry.list();
  }

  async getAgent(key: string): Promise<Agent> {
    const agent = await this.agentRegistry.findByKey(key);
    if (!agent) throw new NotFoundException(`Agent "${key}" not found.`);
    return agent;
  }

  async run(
    agentKey: string,
    companyId: string,
    userId: string,
    message: string,
    conversationId?: string,
  ): Promise<AgentExecution> {
    try {
      return await this.orchestrator.run(agentKey, companyId, userId, message, conversationId);
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async approve(
    executionId: string,
    companyId: string,
    actorUserId: string,
    comment?: string,
  ): Promise<AgentExecution> {
    try {
      return await this.orchestrator.resumeAfterApproval(
        executionId,
        companyId,
        'APPROVED',
        actorUserId,
        comment,
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  async reject(
    executionId: string,
    companyId: string,
    actorUserId: string,
    comment?: string,
  ): Promise<AgentExecution> {
    try {
      return await this.orchestrator.resumeAfterApproval(
        executionId,
        companyId,
        'REJECTED',
        actorUserId,
        comment,
      );
    } catch (err) {
      throw this.mapError(err);
    }
  }

  listExecutions(
    filters: { agentId?: string; status?: AgentExecutionStatus } = {},
  ): Promise<AgentExecution[]> {
    return this.executionService.listExecutions(filters);
  }

  async getExecution(id: string): Promise<AgentExecution> {
    const execution = await this.executionService.findExecution(id);
    if (!execution) throw new NotFoundException(`AgentExecution "${id}" not found.`);
    return execution;
  }

  listMemory(scopeType: MemoryScopeType, scopeId?: string): Promise<Memory[]> {
    return this.memoryService.list(scopeType, scopeId);
  }

  listProviders(companyId: string): Promise<AiProviderConfig[]> {
    return this.providerConfigRepo.list(companyId);
  }

  upsertProvider(
    companyId: string,
    provider: AiProviderKind,
    data: UpsertAiProviderConfigInput,
  ): Promise<AiProviderConfig> {
    return this.providerConfigRepo.upsert(companyId, provider, data);
  }

  private mapError(err: unknown): Error {
    if (err instanceof AgentNotFoundError) return new NotFoundException(err.message);
    if (err instanceof AgentDisabledError) return new ForbiddenException(err.message);
    if (err instanceof AgentExecutionNotResumableError) return new BadRequestException(err.message);
    return err instanceof Error ? err : new Error(String(err));
  }
}
