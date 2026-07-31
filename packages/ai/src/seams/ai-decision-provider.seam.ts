import type {
  AiDecisionContext,
  AiDecisionProvider,
  AiDecisionResult,
} from '@platform/rules-engine';
import type { AiRouter } from '../router/application/ai-router.service';
import type { PromptTemplateService } from '../prompt-engine/application/prompt-template.service';
import { parseJsonResponse } from './domain/parse-json-response';

export const AI_DECISION_PROVIDER_PROMPT_KEY = 'rules-engine.call-ai-action';

/**
 * Real implementation of the "Call AI" rule action / AI Rule Assistant seam (doc 23) — see
 * docs/DOMAIN_MODEL_PHASE6.md §9. Resolves the company's (or platform default) prompt
 * template, asks the router for a decision, and parses the required
 * `{decision, confidence, rationale}` JSON shape back out.
 */
export class RealAiDecisionProvider implements AiDecisionProvider {
  constructor(
    private readonly router: AiRouter,
    private readonly prompts: PromptTemplateService,
  ) {}

  async decide(context: AiDecisionContext): Promise<AiDecisionResult> {
    const systemPrompt = await this.prompts.resolve(AI_DECISION_PROVIDER_PROMPT_KEY, {
      module: context.module,
    });
    const result = await this.router.chatComplete(
      context.companyId,
      {
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: JSON.stringify({
              ruleId: context.ruleId,
              module: context.module,
              attributes: context.attributes,
            }),
          },
        ],
      },
      { purpose: 'rule_assistant' },
    );
    return parseJsonResponse<AiDecisionResult>(result.content, 'AI Rule Assistant');
  }
}
