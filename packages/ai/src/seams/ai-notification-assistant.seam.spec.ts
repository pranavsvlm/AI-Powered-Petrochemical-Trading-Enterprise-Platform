import { TenantContextStore } from '@platform/core';
import {
  RealAiNotificationAssistant,
  AI_NOTIFICATION_SUMMARIZE_PROMPT_KEY,
  AI_NOTIFICATION_PRIORITIZE_PROMPT_KEY,
} from './ai-notification-assistant.seam';
import type { AiRouter } from '../router/application/ai-router.service';
import type { PromptTemplateService } from '../prompt-engine/application/prompt-template.service';

function withCompany<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContextStore.run(
    {
      companyId: 'company-1',
      userId: 'user-1',
      sessionId: null,
      ipAddress: null,
      isPlatformActor: false,
    },
    fn,
  );
}

function makeRouter(content: string | null) {
  return {
    chatComplete: jest.fn().mockResolvedValue({
      content,
      toolCalls: [],
      promptTokens: 10,
      completionTokens: 5,
      provider: 'OLLAMA',
      model: 'llama3.2:1b',
    }),
  };
}

function makePrompts(resolved: string) {
  return { resolve: jest.fn().mockResolvedValue(resolved) };
}

describe('RealAiNotificationAssistant', () => {
  it('summarize() resolves the prompt, calls the router with the ambient companyId, and returns the model text', async () => {
    const router = makeRouter('You have 3 pending approvals.');
    const prompts = makePrompts('Summarize these notifications.');
    const assistant = new RealAiNotificationAssistant(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
    );

    const result = await withCompany(() =>
      assistant.summarize([{ title: 'Approval needed', body: 'PO-1 needs sign-off' }]),
    );

    expect(prompts.resolve).toHaveBeenCalledWith(AI_NOTIFICATION_SUMMARIZE_PROMPT_KEY);
    expect(router.chatComplete).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'Summarize these notifications.' },
          {
            role: 'user',
            content: JSON.stringify([{ title: 'Approval needed', body: 'PO-1 needs sign-off' }]),
          },
        ],
      }),
      { purpose: 'notification_assistant' },
    );
    expect(result).toBe('You have 3 pending approvals.');
  });

  it('summarize() throws when the model returns no content', async () => {
    const router = makeRouter(null);
    const prompts = makePrompts('prompt');
    const assistant = new RealAiNotificationAssistant(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
    );

    await expect(withCompany(() => assistant.summarize([]))).rejects.toThrow(/no summary/);
  });

  it('prioritize() resolves the prompt and parses the ordered id array', async () => {
    const router = makeRouter('["n-2","n-1"]');
    const prompts = makePrompts('Prioritize these notifications.');
    const assistant = new RealAiNotificationAssistant(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
    );

    const result = await withCompany(() =>
      assistant.prioritize([
        { id: 'n-1', body: 'low priority' },
        { id: 'n-2', body: 'urgent' },
      ]),
    );

    expect(prompts.resolve).toHaveBeenCalledWith(AI_NOTIFICATION_PRIORITIZE_PROMPT_KEY);
    expect(result).toEqual(['n-2', 'n-1']);
  });
});
