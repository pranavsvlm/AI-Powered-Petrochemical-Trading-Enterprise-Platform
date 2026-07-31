import type { AiProviderConfig } from '@platform/database';
import { AiRouter } from './ai-router.service';
import {
  AiCostCeilingExceededError,
  AiAllProvidersExhaustedError,
  AiProviderError,
} from '../domain/errors';
import type { LlmProviderClient, ChatCompleteResult } from '../domain/provider-client.port';
import type { AiProviderConfigRepository } from '../infrastructure/ai-provider-config.repository';
import type { AiUsageRepository } from '../infrastructure/ai-usage.repository';

function makeConfig(overrides: Partial<AiProviderConfig> = {}): AiProviderConfig {
  return {
    id: 'cfg-1',
    companyId: 'company-1',
    provider: 'OPENAI',
    enabled: true,
    isDefault: false,
    priority: 0,
    baseUrl: null,
    defaultChatModel: 'gpt-4o-mini',
    defaultEmbedModel: null,
    apiKeyRef: 'OPENAI_API_KEY',
    monthlyCostCeilingUsd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AiProviderConfig;
}

function makeClient(impl: Partial<LlmProviderClient>): LlmProviderClient {
  return {
    chatComplete: impl.chatComplete ?? jest.fn(),
    embed: impl.embed ?? jest.fn(),
  };
}

const okResult: ChatCompleteResult = {
  content: 'hi',
  toolCalls: [],
  promptTokens: 10,
  completionTokens: 5,
};

describe('AiRouter.chatComplete', () => {
  it('calls the sole configured provider and records a success AiUsageRecord', async () => {
    const config = makeConfig();
    const providerConfigRepo: jest.Mocked<Pick<AiProviderConfigRepository, 'listEnabled'>> = {
      listEnabled: jest.fn().mockResolvedValue([config]),
    };
    const usageRepo: jest.Mocked<Pick<AiUsageRepository, 'record' | 'sumCostSince'>> = {
      record: jest.fn().mockResolvedValue(undefined),
      sumCostSince: jest.fn().mockResolvedValue(0),
    };
    const client = makeClient({ chatComplete: jest.fn().mockResolvedValue(okResult) });

    const router = new AiRouter({
      providerConfigRepo: providerConfigRepo as unknown as AiProviderConfigRepository,
      usageRepo: usageRepo as unknown as AiUsageRepository,
      buildClient: () => client,
    });

    const result = await router.chatComplete('company-1', {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toMatchObject({ provider: 'OPENAI', model: 'gpt-4o-mini', content: 'hi' });
    expect(usageRepo.record).toHaveBeenCalledTimes(1);
    expect(usageRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        provider: 'OPENAI',
        promptTokens: 10,
        completionTokens: 5,
      }),
    );
  });

  it('throws AiCostCeilingExceededError and never calls the provider client when the ceiling would be breached', async () => {
    const config = makeConfig({
      monthlyCostCeilingUsd: 1 as unknown as AiProviderConfig['monthlyCostCeilingUsd'],
    });
    const providerConfigRepo = { listEnabled: jest.fn().mockResolvedValue([config]) };
    const usageRepo = {
      record: jest.fn().mockResolvedValue(undefined),
      sumCostSince: jest.fn().mockResolvedValue(999),
    };
    const chatComplete = jest.fn();
    const client = makeClient({ chatComplete });

    const router = new AiRouter({
      providerConfigRepo: providerConfigRepo as unknown as AiProviderConfigRepository,
      usageRepo: usageRepo as unknown as AiUsageRepository,
      buildClient: () => client,
      pricingTable: {
        'OPENAI:gpt-4o-mini': { promptPricePer1kTokens: 1, completionPricePer1kTokens: 1 },
      },
    });

    await expect(
      router.chatComplete('company-1', { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(AiCostCeilingExceededError);
    expect(chatComplete).not.toHaveBeenCalled();
    expect(usageRepo.record).not.toHaveBeenCalled();
  });

  it('falls through to the next provider on a TRANSIENT failure and still returns success', async () => {
    const first = makeConfig({ id: 'cfg-openai', provider: 'OPENAI', priority: 0 });
    const second = makeConfig({
      id: 'cfg-anthropic',
      provider: 'ANTHROPIC',
      priority: 1,
      defaultChatModel: 'claude-3-5-haiku-20241022',
      apiKeyRef: 'ANTHROPIC_API_KEY',
    });
    const providerConfigRepo = { listEnabled: jest.fn().mockResolvedValue([first, second]) };
    const usageRepo = {
      record: jest.fn().mockResolvedValue(undefined),
      sumCostSince: jest.fn().mockResolvedValue(0),
    };
    const failingClient = makeClient({
      chatComplete: jest
        .fn()
        .mockRejectedValue(new AiProviderError('server exploded', 'TRANSIENT', 'OPENAI', 500)),
    });
    const workingClient = makeClient({ chatComplete: jest.fn().mockResolvedValue(okResult) });

    const router = new AiRouter({
      providerConfigRepo: providerConfigRepo as unknown as AiProviderConfigRepository,
      usageRepo: usageRepo as unknown as AiUsageRepository,
      buildClient: (config) => (config.provider === 'OPENAI' ? failingClient : workingClient),
    });

    const result = await router.chatComplete('company-1', {
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result.provider).toBe('ANTHROPIC');
    expect(usageRepo.record).toHaveBeenCalledTimes(2);
    expect(usageRepo.record).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        success: false,
        provider: 'OPENAI',
        errorMessage: 'server exploded',
      }),
    );
    expect(usageRepo.record).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ success: true, provider: 'ANTHROPIC' }),
    );
  });

  it('rethrows immediately on a FATAL failure without touching the next provider', async () => {
    const first = makeConfig({ id: 'cfg-openai', provider: 'OPENAI', priority: 0 });
    const second = makeConfig({
      id: 'cfg-anthropic',
      provider: 'ANTHROPIC',
      priority: 1,
      defaultChatModel: 'claude-3-5-haiku-20241022',
      apiKeyRef: 'ANTHROPIC_API_KEY',
    });
    const providerConfigRepo = { listEnabled: jest.fn().mockResolvedValue([first, second]) };
    const usageRepo = {
      record: jest.fn().mockResolvedValue(undefined),
      sumCostSince: jest.fn().mockResolvedValue(0),
    };
    const failingClient = makeClient({
      chatComplete: jest
        .fn()
        .mockRejectedValue(new AiProviderError('bad request', 'FATAL', 'OPENAI', 400)),
    });
    const secondClient = makeClient({ chatComplete: jest.fn().mockResolvedValue(okResult) });

    const router = new AiRouter({
      providerConfigRepo: providerConfigRepo as unknown as AiProviderConfigRepository,
      usageRepo: usageRepo as unknown as AiUsageRepository,
      buildClient: (config) => (config.provider === 'OPENAI' ? failingClient : secondClient),
    });

    await expect(
      router.chatComplete('company-1', { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(AiProviderError);
    expect(secondClient.chatComplete).not.toHaveBeenCalled();
    expect(usageRepo.record).toHaveBeenCalledTimes(1);
    expect(usageRepo.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, provider: 'OPENAI' }),
    );
  });

  it('throws AiAllProvidersExhaustedError once every configured provider has failed transiently', async () => {
    const first = makeConfig({ id: 'cfg-openai', provider: 'OPENAI', priority: 0 });
    const second = makeConfig({
      id: 'cfg-anthropic',
      provider: 'ANTHROPIC',
      priority: 1,
      defaultChatModel: 'claude-3-5-haiku-20241022',
      apiKeyRef: 'ANTHROPIC_API_KEY',
    });
    const providerConfigRepo = { listEnabled: jest.fn().mockResolvedValue([first, second]) };
    const usageRepo = {
      record: jest.fn().mockResolvedValue(undefined),
      sumCostSince: jest.fn().mockResolvedValue(0),
    };
    const failingClient = makeClient({
      chatComplete: jest
        .fn()
        .mockRejectedValue(new AiProviderError('rate limited', 'RATE_LIMITED', 'x', 429)),
    });

    const router = new AiRouter({
      providerConfigRepo: providerConfigRepo as unknown as AiProviderConfigRepository,
      usageRepo: usageRepo as unknown as AiUsageRepository,
      buildClient: () => failingClient,
    });

    await expect(
      router.chatComplete('company-1', { messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toThrow(AiAllProvidersExhaustedError);
    expect(usageRepo.record).toHaveBeenCalledTimes(2);
  });

  it('respects preferredProvider ordering over priority', async () => {
    const first = makeConfig({ id: 'cfg-openai', provider: 'OPENAI', priority: 0 });
    const second = makeConfig({
      id: 'cfg-anthropic',
      provider: 'ANTHROPIC',
      priority: 1,
      defaultChatModel: 'claude-3-5-haiku-20241022',
      apiKeyRef: 'ANTHROPIC_API_KEY',
    });
    const providerConfigRepo = { listEnabled: jest.fn().mockResolvedValue([first, second]) };
    const usageRepo = {
      record: jest.fn().mockResolvedValue(undefined),
      sumCostSince: jest.fn().mockResolvedValue(0),
    };
    const openaiClient = makeClient({ chatComplete: jest.fn().mockResolvedValue(okResult) });
    const anthropicClient = makeClient({ chatComplete: jest.fn().mockResolvedValue(okResult) });

    const router = new AiRouter({
      providerConfigRepo: providerConfigRepo as unknown as AiProviderConfigRepository,
      usageRepo: usageRepo as unknown as AiUsageRepository,
      buildClient: (config) => (config.provider === 'OPENAI' ? openaiClient : anthropicClient),
    });

    const result = await router.chatComplete(
      'company-1',
      { messages: [{ role: 'user', content: 'hi' }] },
      { preferredProvider: 'ANTHROPIC' },
    );

    expect(result.provider).toBe('ANTHROPIC');
    expect(openaiClient.chatComplete).not.toHaveBeenCalled();
  });
});

describe('AiRouter.embed', () => {
  it('uses only providers configured with a defaultEmbedModel, ignoring chat-only configs', async () => {
    const chatOnly = makeConfig({ id: 'cfg-chat', provider: 'OPENAI', defaultEmbedModel: null });
    const embedCapable = makeConfig({
      id: 'cfg-embed',
      provider: 'OLLAMA',
      defaultChatModel: null,
      defaultEmbedModel: 'nomic-embed-text',
      apiKeyRef: null,
    });
    const providerConfigRepo = {
      listEnabled: jest.fn().mockResolvedValue([chatOnly, embedCapable]),
    };
    const usageRepo = {
      record: jest.fn().mockResolvedValue(undefined),
      sumCostSince: jest.fn().mockResolvedValue(0),
    };
    const chatOnlyClient = makeClient({
      embed: jest.fn().mockRejectedValue(new Error('should not be called')),
    });
    const embedClient = makeClient({
      embed: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2], promptTokens: 3 }),
    });

    const router = new AiRouter({
      providerConfigRepo: providerConfigRepo as unknown as AiProviderConfigRepository,
      usageRepo: usageRepo as unknown as AiUsageRepository,
      buildClient: (config) => (config.provider === 'OLLAMA' ? embedClient : chatOnlyClient),
    });

    const result = await router.embed('company-1', { input: 'hello' });

    expect(result).toMatchObject({
      provider: 'OLLAMA',
      model: 'nomic-embed-text',
      embedding: [0.1, 0.2],
    });
    expect(chatOnlyClient.embed).not.toHaveBeenCalled();
  });
});
