import type { AiDecisionContext, AiDecisionResult } from '@platform/rules-engine';

export interface NotificationClientPort {
  notify(input: {
    companyId: string;
    recipientUserId: string;
    title: string;
    body: string;
    category: string;
    priority?: string;
  }): Promise<{ notificationId: string }>;
}

/** Re-exported shape so workflow doesn't need to import rules-engine's port directly everywhere. */
export interface AiDecisionProviderPort {
  decide(context: AiDecisionContext): Promise<AiDecisionResult>;
}
