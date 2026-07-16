import { NotImplementedInPhaseError } from '@platform/core';

export interface AiDecisionContext {
  ruleId: string;
  module: string;
  attributes: Record<string, unknown>;
}

export interface AiDecisionResult {
  decision: string;
  confidence: number;
  rationale: string;
}

/**
 * Seam for the "Call AI" rule action / "AI Rule Assistant" (doc 23). See
 * docs/DOMAIN_MODEL_PHASE2.md §1 — no real LLM call happens in Phase 2. The shipped
 * implementation below always throws a typed NotImplementedInPhaseError so callers get an
 * explicit, documented failure instead of a silent no-op.
 */
export interface AiDecisionProvider {
  decide(context: AiDecisionContext): Promise<AiDecisionResult>;
}

export class NotImplementedAiDecisionProvider implements AiDecisionProvider {
  decide(): Promise<AiDecisionResult> {
    throw new NotImplementedInPhaseError('AI Rule Assistant / Call AI action', 'Phase 3+');
  }
}
