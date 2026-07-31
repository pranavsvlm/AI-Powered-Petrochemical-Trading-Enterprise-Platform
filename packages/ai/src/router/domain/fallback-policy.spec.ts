import { selectProviderOrder, shouldFallback } from './fallback-policy';

describe('selectProviderOrder', () => {
  const configs = [
    { provider: 'GEMINI' as const, enabled: true, isDefault: false, priority: 2 },
    { provider: 'OPENAI' as const, enabled: true, isDefault: true, priority: 0 },
    { provider: 'ANTHROPIC' as const, enabled: true, isDefault: false, priority: 1 },
    { provider: 'OLLAMA' as const, enabled: false, isDefault: false, priority: 3 },
  ];

  it('drops disabled providers entirely', () => {
    const order = selectProviderOrder(configs);
    expect(order.some((c) => c.provider === 'OLLAMA')).toBe(false);
  });

  it('puts the explicit preferred provider first, even if it is not the configured default', () => {
    const order = selectProviderOrder(configs, 'ANTHROPIC');
    expect(order[0]!.provider).toBe('ANTHROPIC');
  });

  it('falls back to the isDefault provider when no preference is given', () => {
    const order = selectProviderOrder(configs);
    expect(order[0]!.provider).toBe('OPENAI');
  });

  it('orders the remainder by ascending priority', () => {
    const order = selectProviderOrder(configs);
    expect(order.map((c) => c.provider)).toEqual(['OPENAI', 'ANTHROPIC', 'GEMINI']);
  });
});

describe('shouldFallback', () => {
  it('retries TRANSIENT and RATE_LIMITED failures', () => {
    expect(shouldFallback('TRANSIENT')).toBe(true);
    expect(shouldFallback('RATE_LIMITED')).toBe(true);
  });

  it('does not retry FATAL failures', () => {
    expect(shouldFallback('FATAL')).toBe(false);
  });
});
