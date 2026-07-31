export interface CostCeilingCheck {
  allowed: boolean;
  reason?: string;
}

/**
 * The pure check behind "cost ceilings that actually throttle" — AiRouter calls this BEFORE
 * dispatching to a provider, so a breach blocks the call outright rather than merely being
 * logged after the fact. A null ceiling means the company hasn't configured one — unlimited.
 */
export function evaluateCostCeiling(
  currentPeriodSpendUsd: number,
  estimatedCallCostUsd: number,
  ceilingUsd: number | null,
): CostCeilingCheck {
  if (ceilingUsd == null) return { allowed: true };
  const projected = currentPeriodSpendUsd + estimatedCallCostUsd;
  if (projected > ceilingUsd) {
    return {
      allowed: false,
      reason: `Would exceed monthly ceiling of $${ceilingUsd} (current spend $${currentPeriodSpendUsd.toFixed(4)} + estimated $${estimatedCallCostUsd.toFixed(4)} = $${projected.toFixed(4)})`,
    };
  }
  return { allowed: true };
}
