import type { TenantScopedPrismaClient, AiProviderKind } from '@platform/database';

export interface RecordUsageInput {
  companyId: string;
  provider: AiProviderKind;
  model: string;
  purpose: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string;
  requestedByUserId?: string;
  agentExecutionId?: string;
}

export class AiUsageRepository {
  constructor(private readonly prisma: TenantScopedPrismaClient) {}

  record(input: RecordUsageInput): Promise<void> {
    return this.prisma.aiUsageRecord
      .create({
        data: {
          companyId: input.companyId,
          provider: input.provider,
          model: input.model,
          purpose: input.purpose,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens: input.totalTokens,
          costUsd: input.costUsd,
          latencyMs: input.latencyMs,
          success: input.success,
          errorMessage: input.errorMessage,
          requestedByUserId: input.requestedByUserId,
          agentExecutionId: input.agentExecutionId,
        },
      })
      .then(() => undefined);
  }

  /** Sum of `costUsd` for a provider's successful calls since `periodStart` — the basis for cost-ceiling enforcement. */
  async sumCostSince(
    companyId: string,
    provider: AiProviderKind,
    periodStart: Date,
  ): Promise<number> {
    const result = await this.prisma.aiUsageRecord.aggregate({
      where: { companyId, provider, success: true, createdAt: { gte: periodStart } },
      _sum: { costUsd: true },
    });
    return Number(result._sum.costUsd ?? 0);
  }
}

/** The current calendar-month boundary — `AiProviderConfig.monthlyCostCeilingUsd` resets on this cadence. */
export function currentBillingPeriodStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
