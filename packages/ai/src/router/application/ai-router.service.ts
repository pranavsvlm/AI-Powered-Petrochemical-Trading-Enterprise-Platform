import type { AiProviderConfig, AiProviderKind } from '@platform/database';
import type {
  ChatMessage,
  ToolSchema,
  ChatCompleteResult,
  EmbedResult,
  LlmProviderClient,
} from '../domain/provider-client.port';
import {
  AiProviderError,
  AiCostCeilingExceededError,
  AiAllProvidersExhaustedError,
} from '../domain/errors';
import { evaluateCostCeiling } from '../domain/cost-ceiling';
import { selectProviderOrder, shouldFallback } from '../domain/fallback-policy';
import {
  DEFAULT_PRICING_TABLE,
  estimateCostUsd,
  type PricingTable,
} from '../domain/provider-pricing';
import type { AiProviderConfigRepository } from '../infrastructure/ai-provider-config.repository';
import {
  currentBillingPeriodStart,
  type AiUsageRepository,
} from '../infrastructure/ai-usage.repository';
import {
  buildProviderClient,
  defaultApiKeyResolver,
  type ApiKeyResolver,
} from '../infrastructure/client-factory';

export interface RouterChatRequest {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
}

export interface RouterCallOptions {
  purpose?: string;
  requestedByUserId?: string;
  agentExecutionId?: string;
}

export interface RouterChatOptions extends RouterCallOptions {
  preferredProvider?: AiProviderKind;
}

export interface RouterChatResult extends ChatCompleteResult {
  provider: AiProviderKind;
  model: string;
}

export interface RouterEmbedRequest {
  input: string;
}

export interface RouterEmbedResult extends EmbedResult {
  provider: AiProviderKind;
  model: string;
}

export interface AiRouterDeps {
  providerConfigRepo: AiProviderConfigRepository;
  usageRepo: AiUsageRepository;
  pricingTable?: PricingTable;
  resolveApiKey?: ApiKeyResolver;
  buildClient?: (config: AiProviderConfig) => LlmProviderClient;
  now?: () => Date;
}

/**
 * Rough chars/4 pre-flight token estimate, used ONLY to evaluate the cost ceiling before a
 * provider is dispatched — the AiUsageRecord written after the call always uses the real
 * token counts the provider itself reports. Same heuristic GeminiClient uses for its
 * (token-count-less) embedding response.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Routes chat/embedding calls across a company's configured providers with a real fallback
 * policy and cost-ceiling enforcement — see docs/DOMAIN_MODEL_PHASE6.md §1/§3. A cost-ceiling
 * breach throws immediately and never falls back to a spendier provider to route around it;
 * only TRANSIENT/RATE_LIMITED provider failures advance to the next configured provider, a
 * FATAL failure rethrows immediately. Every attempt — success or failure — writes an
 * AiUsageRecord, which is also the ledger cost-ceiling checks sum over.
 */
export class AiRouter {
  private readonly pricingTable: PricingTable;
  private readonly buildClient: (config: AiProviderConfig) => LlmProviderClient;
  private readonly now: () => Date;

  constructor(private readonly deps: AiRouterDeps) {
    this.pricingTable = deps.pricingTable ?? DEFAULT_PRICING_TABLE;
    const resolveApiKey = deps.resolveApiKey ?? defaultApiKeyResolver;
    this.buildClient = deps.buildClient ?? ((config) => buildProviderClient(config, resolveApiKey));
    this.now = deps.now ?? (() => new Date());
  }

  async chatComplete(
    companyId: string,
    request: RouterChatRequest,
    options: RouterChatOptions = {},
  ): Promise<RouterChatResult> {
    const configs = await this.deps.providerConfigRepo.listEnabled(companyId);
    const usable = configs.filter(
      (c): c is AiProviderConfig & { defaultChatModel: string } => !!c.defaultChatModel,
    );
    const ordered = selectProviderOrder(usable, options.preferredProvider ?? null);

    const estimatedPromptTokens = estimateTokens(request.messages.map((m) => m.content).join('\n'));
    const estimatedCompletionTokens = request.maxTokens ?? 512;

    const attempts: Array<{ provider: string; message: string }> = [];

    for (const config of ordered) {
      const model = config.defaultChatModel;

      await this.enforceCostCeiling(
        companyId,
        config,
        model,
        estimatedPromptTokens,
        estimatedCompletionTokens,
      );

      const start = this.now().getTime();
      try {
        const client = this.buildClient(config);
        const result = await client.chatComplete({
          model,
          messages: request.messages,
          tools: request.tools,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        await this.recordSuccess(companyId, config, model, options, this.now().getTime() - start, {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        });
        return { ...result, provider: config.provider, model };
      } catch (err) {
        const shouldContinue = await this.recordFailureAndDecide(
          companyId,
          config,
          model,
          options,
          this.now().getTime() - start,
          err,
          attempts,
        );
        if (!shouldContinue) throw err;
      }
    }

    throw new AiAllProvidersExhaustedError(attempts);
  }

  async embed(
    companyId: string,
    request: RouterEmbedRequest,
    options: RouterCallOptions = {},
  ): Promise<RouterEmbedResult> {
    const configs = await this.deps.providerConfigRepo.listEnabled(companyId);
    const usable = configs.filter(
      (c): c is AiProviderConfig & { defaultEmbedModel: string } => !!c.defaultEmbedModel,
    );
    // Embeddings are deliberately not provider-switchable per company request (pgvector columns
    // are fixed-width) — always whichever provider(s) are configured with a defaultEmbedModel,
    // in priority order, never an explicit per-call preference override.
    const ordered = selectProviderOrder(usable, null);

    const estimatedTokens = estimateTokens(request.input);
    const attempts: Array<{ provider: string; message: string }> = [];

    for (const config of ordered) {
      const model = config.defaultEmbedModel;

      await this.enforceCostCeiling(companyId, config, model, estimatedTokens, 0);

      const start = this.now().getTime();
      try {
        const client = this.buildClient(config);
        const result = await client.embed({ model, input: request.input });
        await this.recordSuccess(companyId, config, model, options, this.now().getTime() - start, {
          promptTokens: result.promptTokens,
          completionTokens: 0,
        });
        return { ...result, provider: config.provider, model };
      } catch (err) {
        const shouldContinue = await this.recordFailureAndDecide(
          companyId,
          config,
          model,
          options,
          this.now().getTime() - start,
          err,
          attempts,
        );
        if (!shouldContinue) throw err;
      }
    }

    throw new AiAllProvidersExhaustedError(attempts);
  }

  private async enforceCostCeiling(
    companyId: string,
    config: AiProviderConfig,
    model: string,
    estimatedPromptTokens: number,
    estimatedCompletionTokens: number,
  ): Promise<void> {
    if (config.monthlyCostCeilingUsd == null) return;
    const estimatedCost = estimateCostUsd(
      this.pricingTable,
      config.provider,
      model,
      estimatedPromptTokens,
      estimatedCompletionTokens,
    );
    const periodStart = currentBillingPeriodStart(this.now());
    const currentSpend = await this.deps.usageRepo.sumCostSince(
      companyId,
      config.provider,
      periodStart,
    );
    const check = evaluateCostCeiling(
      currentSpend,
      estimatedCost,
      Number(config.monthlyCostCeilingUsd),
    );
    if (!check.allowed) {
      throw new AiCostCeilingExceededError(
        `${config.provider}: ${check.reason ?? 'cost ceiling exceeded'}`,
      );
    }
  }

  private async recordSuccess(
    companyId: string,
    config: AiProviderConfig,
    model: string,
    options: RouterCallOptions,
    latencyMs: number,
    tokens: { promptTokens: number; completionTokens: number },
  ): Promise<void> {
    const costUsd = estimateCostUsd(
      this.pricingTable,
      config.provider,
      model,
      tokens.promptTokens,
      tokens.completionTokens,
    );
    await this.deps.usageRepo.record({
      companyId,
      provider: config.provider,
      model,
      purpose: options.purpose ?? 'chat',
      promptTokens: tokens.promptTokens,
      completionTokens: tokens.completionTokens,
      totalTokens: tokens.promptTokens + tokens.completionTokens,
      costUsd,
      latencyMs,
      success: true,
      requestedByUserId: options.requestedByUserId,
      agentExecutionId: options.agentExecutionId,
    });
  }

  /** Records the failed attempt, then returns whether the caller should advance to the next provider. */
  private async recordFailureAndDecide(
    companyId: string,
    config: AiProviderConfig,
    model: string,
    options: RouterCallOptions,
    latencyMs: number,
    err: unknown,
    attempts: Array<{ provider: string; message: string }>,
  ): Promise<boolean> {
    const kind = err instanceof AiProviderError ? err.kind : 'FATAL';
    const message = err instanceof Error ? err.message : String(err);
    await this.deps.usageRepo.record({
      companyId,
      provider: config.provider,
      model,
      purpose: options.purpose ?? 'chat',
      costUsd: 0,
      latencyMs,
      success: false,
      errorMessage: message,
      requestedByUserId: options.requestedByUserId,
      agentExecutionId: options.agentExecutionId,
    });
    attempts.push({ provider: config.provider, message });
    return shouldFallback(kind);
  }
}
