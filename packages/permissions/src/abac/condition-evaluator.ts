import type { AttributeContext } from '@platform/types';

/**
 * A small, safe, JSON-logic-style condition language for ABAC policy definitions
 * and approval-rule trigger conditions (doc 07). No `eval`/`Function` is ever used —
 * every operator is an explicit case in the switch below, so a malicious or malformed
 * policy JSON can only ever fail to match, never execute arbitrary code.
 *
 * Grammar (all nodes are plain JSON):
 *   { "==": [leftExpr, rightExpr] }
 *   { "!=": [leftExpr, rightExpr] }
 *   { ">":  [leftExpr, rightExpr] }
 *   { ">=": [leftExpr, rightExpr] }
 *   { "<":  [leftExpr, rightExpr] }
 *   { "<=": [leftExpr, rightExpr] }
 *   { "in": [leftExpr, [values...]] }
 *   { "and": [cond, cond, ...] }
 *   { "or":  [cond, cond, ...] }
 *   { "not": cond }
 *   { "var": "attributeName" }   -- resolves against the AttributeContext
 *   literal string | number | boolean
 */
export type ConditionNode =
  | { '==': [ConditionExpr, ConditionExpr] }
  | { '!=': [ConditionExpr, ConditionExpr] }
  | { '>': [ConditionExpr, ConditionExpr] }
  | { '>=': [ConditionExpr, ConditionExpr] }
  | { '<': [ConditionExpr, ConditionExpr] }
  | { '<=': [ConditionExpr, ConditionExpr] }
  | { in: [ConditionExpr, ConditionExpr[]] }
  | { and: ConditionNode[] }
  | { or: ConditionNode[] }
  | { not: ConditionNode };

export type ConditionExpr = ConditionNode | { var: string } | string | number | boolean | null;

const COMPARATORS = new Set(['==', '!=', '>', '>=', '<', '<=']);

export class ConditionEvaluationError extends Error {}

function resolveExpr(expr: ConditionExpr, context: AttributeContext): unknown {
  if (expr === null || typeof expr !== 'object') {
    return expr;
  }
  if ('var' in expr && typeof (expr as { var: unknown }).var === 'string') {
    return context[(expr as { var: string }).var];
  }
  // A nested boolean condition used in a value position — evaluate it recursively.
  return evaluateCondition(expr as ConditionNode, context);
}

/**
 * Evaluates a condition tree against a typed attribute context. Returns a boolean.
 * Throws ConditionEvaluationError for structurally invalid nodes (unknown operator,
 * wrong arity) rather than silently matching — a malformed policy must fail loudly.
 */
export function evaluateCondition(node: ConditionNode, context: AttributeContext): boolean {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) {
    throw new ConditionEvaluationError('Condition node must be a plain object.');
  }

  const keys = Object.keys(node);
  if (keys.length !== 1) {
    throw new ConditionEvaluationError(
      `Condition node must have exactly one operator key, got: ${keys.join(',')}`,
    );
  }
  const op = keys[0] as string;

  if (op === 'and') {
    const clauses = (node as { and: ConditionNode[] }).and;
    if (!Array.isArray(clauses) || clauses.length === 0) {
      throw new ConditionEvaluationError('"and" requires a non-empty array of conditions.');
    }
    return clauses.every((c) => evaluateCondition(c, context));
  }

  if (op === 'or') {
    const clauses = (node as { or: ConditionNode[] }).or;
    if (!Array.isArray(clauses) || clauses.length === 0) {
      throw new ConditionEvaluationError('"or" requires a non-empty array of conditions.');
    }
    return clauses.some((c) => evaluateCondition(c, context));
  }

  if (op === 'not') {
    const inner = (node as { not: ConditionNode }).not;
    return !evaluateCondition(inner, context);
  }

  if (op === 'in') {
    const [left, values] = (node as { in: [ConditionExpr, ConditionExpr[]] }).in;
    if (!Array.isArray(values)) {
      throw new ConditionEvaluationError('"in" second argument must be an array.');
    }
    const leftVal = resolveExpr(left, context);
    return values.map((v) => resolveExpr(v, context)).some((v) => v === leftVal);
  }

  if (COMPARATORS.has(op)) {
    const pair = (node as unknown as Record<string, [ConditionExpr, ConditionExpr] | undefined>)[
      op
    ];
    if (!Array.isArray(pair) || pair.length !== 2) {
      throw new ConditionEvaluationError(`"${op}" requires exactly two operands.`);
    }
    const left = resolveExpr(pair[0] as ConditionExpr, context);
    const right = resolveExpr(pair[1] as ConditionExpr, context);
    return compare(op, left, right);
  }

  throw new ConditionEvaluationError(`Unknown operator "${op}".`);
}

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
    case '>=':
    case '<':
    case '<=': {
      if (typeof left !== 'number' || typeof right !== 'number') {
        throw new ConditionEvaluationError(
          `"${op}" requires numeric operands, got ${typeof left} and ${typeof right}.`,
        );
      }
      if (op === '>') return left > right;
      if (op === '>=') return left >= right;
      if (op === '<') return left < right;
      return left <= right;
    }
    default:
      throw new ConditionEvaluationError(`Unknown comparator "${op}".`);
  }
}
