import {
  RealAiDecisionProvider,
  AI_DECISION_PROVIDER_PROMPT_KEY,
} from './ai-decision-provider.seam';
import type { AiRouter } from '../router/application/ai-router.service';
import type { PromptTemplateService } from '../prompt-engine/application/prompt-template.service';

function makeRouter(content: string | null): jest.Mocked<Pick<AiRouter, 'chatComplete'>> {
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

function makePrompts(resolved: string): jest.Mocked<Pick<PromptTemplateService, 'resolve'>> {
  return { resolve: jest.fn().mockResolvedValue(resolved) };
}

describe('RealAiDecisionProvider', () => {
  it('resolves the prompt template, calls the router with the rule context, and parses the decision', async () => {
    const router = makeRouter('{"decision":"APPROVE","confidence":0.9,"rationale":"looks fine"}');
    const prompts = makePrompts('You are a rule assistant for {{module}}.');

    const provider = new RealAiDecisionProvider(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
    );

    const result = await provider.decide({
      ruleId: 'rule-1',
      companyId: 'company-1',
      module: 'orders',
      attributes: { amount: 500 },
    });

    expect(prompts.resolve).toHaveBeenCalledWith(AI_DECISION_PROVIDER_PROMPT_KEY, {
      module: 'orders',
    });
    expect(router.chatComplete).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are a rule assistant for {{module}}.' },
          {
            role: 'user',
            content: JSON.stringify({
              ruleId: 'rule-1',
              module: 'orders',
              attributes: { amount: 500 },
            }),
          },
        ],
      }),
      { purpose: 'rule_assistant' },
    );
    expect(result).toEqual({ decision: 'APPROVE', confidence: 0.9, rationale: 'looks fine' });
  });

  it('throws when the model response cannot be parsed as the expected JSON shape', async () => {
    const router = makeRouter('not json');
    const prompts = makePrompts('prompt');
    const provider = new RealAiDecisionProvider(
      router as unknown as AiRouter,
      prompts as unknown as PromptTemplateService,
    );

    await expect(
      provider.decide({
        ruleId: 'rule-1',
        companyId: 'company-1',
        module: 'orders',
        attributes: {},
      }),
    ).rejects.toThrow(/AI Rule Assistant/);
  });
});
