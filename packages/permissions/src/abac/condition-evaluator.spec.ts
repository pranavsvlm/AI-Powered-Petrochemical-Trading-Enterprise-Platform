import {
  evaluateCondition,
  ConditionEvaluationError,
  type ConditionNode,
} from './condition-evaluator';
import type { AttributeContext } from '@platform/types';

const baseContext: AttributeContext = {
  companyId: 'company-1',
  userId: 'user-1',
  department: 'Sales',
  region: 'EMEA',
  orderValue: 5000,
  currency: 'USD',
  businessHours: true,
};

describe('evaluateCondition', () => {
  it('evaluates a simple equality condition', () => {
    const node: ConditionNode = { '==': [{ var: 'department' }, 'Sales'] };
    expect(evaluateCondition(node, baseContext)).toBe(true);
    expect(evaluateCondition({ '==': [{ var: 'department' }, 'HR'] }, baseContext)).toBe(false);
  });

  it('evaluates numeric comparisons for approval-limit style rules', () => {
    const node: ConditionNode = { '>': [{ var: 'orderValue' }, 1000] };
    expect(evaluateCondition(node, baseContext)).toBe(true);
    expect(evaluateCondition({ '<=': [{ var: 'orderValue' }, 1000] }, baseContext)).toBe(false);
  });

  it('evaluates "in" against a list of allowed regions', () => {
    const node: ConditionNode = { in: [{ var: 'region' }, ['EMEA', 'APAC']] };
    expect(evaluateCondition(node, baseContext)).toBe(true);
    expect(evaluateCondition({ in: [{ var: 'region' }, ['NA']] }, baseContext)).toBe(false);
  });

  it('combines conditions with and/or/not', () => {
    const node: ConditionNode = {
      and: [
        { '==': [{ var: 'department' }, 'Sales'] },
        {
          or: [{ '>': [{ var: 'orderValue' }, 10000] }, { '==': [{ var: 'businessHours' }, true] }],
        },
        { not: { '==': [{ var: 'currency' }, 'EUR'] } },
      ],
    };
    expect(evaluateCondition(node, baseContext)).toBe(true);
  });

  it('models the doc 07 example: quotation discount > 10% escalates to Sales Manager', () => {
    const discountContext: AttributeContext = {
      ...baseContext,
      discountPercent: 15,
    } as AttributeContext;
    const node: ConditionNode = { '>': [{ var: 'discountPercent' }, 10] };
    expect(evaluateCondition(node, discountContext)).toBe(true);
  });

  it('models the doc 07 example: order > USD 100,000 escalates to Director', () => {
    const node: ConditionNode = {
      and: [{ '==': [{ var: 'currency' }, 'USD'] }, { '>': [{ var: 'orderValue' }, 100000] }],
    };
    expect(evaluateCondition(node, { ...baseContext, orderValue: 150000 })).toBe(true);
    expect(evaluateCondition(node, { ...baseContext, orderValue: 50000 })).toBe(false);
  });

  it('throws on an unknown operator instead of silently matching', () => {
    expect(() =>
      evaluateCondition({ unknownOp: [] } as unknown as ConditionNode, baseContext),
    ).toThrow(ConditionEvaluationError);
  });

  it('throws on a comparator applied to non-numeric operands', () => {
    const node: ConditionNode = { '>': [{ var: 'department' }, 1] };
    expect(() => evaluateCondition(node, baseContext)).toThrow(ConditionEvaluationError);
  });

  it('throws on a malformed node with multiple keys', () => {
    const node = { '==': [1, 1], '!=': [2, 2] } as unknown as ConditionNode;
    expect(() => evaluateCondition(node, baseContext)).toThrow(ConditionEvaluationError);
  });

  it('resolves missing attributes as undefined and does not match strict equality', () => {
    const node: ConditionNode = { '==': [{ var: 'jobTitle' }, 'Director'] };
    expect(evaluateCondition(node, baseContext)).toBe(false);
  });
});
