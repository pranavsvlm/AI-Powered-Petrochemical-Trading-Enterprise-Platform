import { TenantContextStore } from '@platform/core';
import type { AiNotificationAssistant } from '@platform/notifications';
import type { AiRouter } from '../router/application/ai-router.service';
import type { PromptTemplateService } from '../prompt-engine/application/prompt-template.service';
import { parseJsonResponse } from './domain/parse-json-response';

export const AI_NOTIFICATION_SUMMARIZE_PROMPT_KEY = 'notifications.ai-summarize';
export const AI_NOTIFICATION_PRIORITIZE_PROMPT_KEY = 'notifications.ai-prioritize';

/**
 * Real implementation of the AI Notification Assistant seam (doc 24) — see
 * docs/DOMAIN_MODEL_PHASE6.md §9. The port's methods take the notification data directly as
 * arguments (no repository access needed), so — like RealAiDecisionProvider — this reads the
 * ambient tenant context for `companyId` rather than requiring an explicit constructor-bound
 * one, matching how every other request-scoped service in this codebase resolves it.
 */
export class RealAiNotificationAssistant implements AiNotificationAssistant {
  constructor(
    private readonly router: AiRouter,
    private readonly prompts: PromptTemplateService,
  ) {}

  async summarize(notifications: Array<{ title: string; body: string }>): Promise<string> {
    const companyId = TenantContextStore.requireCompanyId();
    const systemPrompt = await this.prompts.resolve(AI_NOTIFICATION_SUMMARIZE_PROMPT_KEY);
    const result = await this.router.chatComplete(
      companyId,
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(notifications) },
        ],
      },
      { purpose: 'notification_assistant' },
    );
    if (!result.content) {
      throw new Error('AI Notification Assistant: the model returned no summary.');
    }
    return result.content;
  }

  async prioritize(notifications: Array<{ id: string; body: string }>): Promise<string[]> {
    const companyId = TenantContextStore.requireCompanyId();
    const systemPrompt = await this.prompts.resolve(AI_NOTIFICATION_PRIORITIZE_PROMPT_KEY);
    const result = await this.router.chatComplete(
      companyId,
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(notifications) },
        ],
      },
      { purpose: 'notification_assistant' },
    );
    return parseJsonResponse<string[]>(
      result.content,
      'AI Notification Assistant (prioritization)',
    );
  }
}
