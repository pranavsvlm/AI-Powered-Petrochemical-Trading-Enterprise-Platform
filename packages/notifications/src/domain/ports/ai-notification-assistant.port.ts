import { NotImplementedInPhaseError } from '@platform/core';

export interface AiNotificationAssistant {
  summarize(notifications: Array<{ title: string; body: string }>): Promise<string>;
  prioritize(notifications: Array<{ id: string; body: string }>): Promise<string[]>;
}

/** docs/DOMAIN_MODEL_PHASE2.md §1 — no LLM call; typed seam only. */
export class NotImplementedAiNotificationAssistant implements AiNotificationAssistant {
  summarize(): Promise<string> {
    throw new NotImplementedInPhaseError('AI Notification Assistant (summarization)', 'Phase 3+');
  }
  prioritize(): Promise<string[]> {
    throw new NotImplementedInPhaseError('AI Notification Assistant (prioritization)', 'Phase 3+');
  }
}
