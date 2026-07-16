import { RuleConflictResolver, type RuleWithMeta } from './rule-conflict-resolver';

function rule(overrides: Partial<RuleWithMeta>): RuleWithMeta {
  return {
    ruleId: 'r1',
    companyId: 'c1',
    module: 'orders',
    priority: 0,
    condition: { '==': [{ var: 'amount' }, 100] },
    actions: [],
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

describe('RuleConflictResolver.sort', () => {
  it('sorts by priority DESC first', () => {
    const a = rule({ ruleId: 'a', priority: 1 });
    const b = rule({ ruleId: 'b', priority: 5 });
    expect(RuleConflictResolver.sort([a, b]).map((r) => r.ruleId)).toEqual(['b', 'a']);
  });

  it('breaks priority ties by updatedAt DESC', () => {
    const a = rule({ ruleId: 'a', priority: 1, updatedAt: new Date('2024-01-01') });
    const b = rule({ ruleId: 'b', priority: 1, updatedAt: new Date('2024-06-01') });
    expect(RuleConflictResolver.sort([a, b]).map((r) => r.ruleId)).toEqual(['b', 'a']);
  });

  it('breaks remaining ties by ruleId ASC deterministically', () => {
    const a = rule({ ruleId: 'zeta', priority: 1, updatedAt: new Date('2024-01-01') });
    const b = rule({ ruleId: 'alpha', priority: 1, updatedAt: new Date('2024-01-01') });
    expect(RuleConflictResolver.sort([a, b]).map((r) => r.ruleId)).toEqual(['alpha', 'zeta']);
  });
});

describe('RuleConflictResolver.resolveActionPlan', () => {
  it('executes actions of higher-priority rules first', () => {
    const high = rule({ ruleId: 'high', priority: 10, actions: [{ type: 'WARN', params: {} }] });
    const low = rule({ ruleId: 'low', priority: 1, actions: [{ type: 'ALLOW', params: {} }] });
    const plan = RuleConflictResolver.resolveActionPlan([high, low]);
    expect(plan.map((p) => p.ruleId)).toEqual(['high', 'low']);
  });

  it('BLOCK short-circuits lower-priority rules (safety wins ties)', () => {
    const blocker = rule({
      ruleId: 'blocker',
      priority: 5,
      actions: [{ type: 'BLOCK', params: {} }],
    });
    const allower = rule({
      ruleId: 'allower',
      priority: 1,
      actions: [{ type: 'ALLOW', params: {} }],
    });
    const plan = RuleConflictResolver.resolveActionPlan([blocker, allower]);
    expect(plan.map((p) => p.ruleId)).toEqual(['blocker']);
  });

  it('a strictly higher-priority terminal ALLOW stops lower-priority BLOCK from running', () => {
    const allower = rule({
      ruleId: 'allower',
      priority: 10,
      actions: [{ type: 'ALLOW', params: {}, terminal: true }],
    });
    const blocker = rule({
      ruleId: 'blocker',
      priority: 1,
      actions: [{ type: 'BLOCK', params: {} }],
    });
    const plan = RuleConflictResolver.resolveActionPlan([allower, blocker]);
    expect(plan.map((p) => p.ruleId)).toEqual(['allower']);
  });
});

describe('RuleConflictResolver.detectConflicts', () => {
  it('flags overlapping same-field-equality rules with contradictory ALLOW/BLOCK actions', () => {
    const a = rule({
      ruleId: 'a',
      condition: { '==': [{ var: 'region' }, 'US'] },
      actions: [{ type: 'ALLOW', params: {} }],
    });
    const b = rule({
      ruleId: 'b',
      condition: { '==': [{ var: 'region' }, 'US'] },
      actions: [{ type: 'BLOCK', params: {} }],
    });
    const conflicts = RuleConflictResolver.detectConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ ruleAId: 'a', ruleBId: 'b' });
  });

  it('does not flag rules in different modules or companies', () => {
    const a = rule({ ruleId: 'a', module: 'orders', actions: [{ type: 'ALLOW', params: {} }] });
    const b = rule({ ruleId: 'b', module: 'invoices', actions: [{ type: 'BLOCK', params: {} }] });
    expect(RuleConflictResolver.detectConflicts([a, b])).toHaveLength(0);
  });

  it('does not flag two rules that both ALLOW', () => {
    const a = rule({ ruleId: 'a', actions: [{ type: 'ALLOW', params: {} }] });
    const b = rule({ ruleId: 'b', actions: [{ type: 'ALLOW', params: {} }] });
    expect(RuleConflictResolver.detectConflicts([a, b])).toHaveLength(0);
  });
});
