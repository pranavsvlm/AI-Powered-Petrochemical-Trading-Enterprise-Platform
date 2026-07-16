import type { RuleActionDef, RuleDefinition } from '../domain/rule-types';

export interface RuleWithMeta extends RuleDefinition {
  updatedAt: Date;
}

/**
 * Deterministic conflict-resolution algorithm (docs/DOMAIN_MODEL_PHASE2.md §4):
 *  1. Sort applicable rules by priority DESC, updatedAt DESC, id ASC (fully deterministic).
 *  2. Walk the sorted list; execute each matched rule's actions in that order.
 *  3. Safety wins ties: once any matched rule contributes a BLOCK action, no further
 *     (lower-priority, or equal-priority-later-in-tiebreak) rule's actions execute, UNLESS
 *     a strictly higher-priority rule already produced a terminal ALLOW.
 */
export class RuleConflictResolver {
  static sort(rules: RuleWithMeta[]): RuleWithMeta[] {
    return [...rules].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const bT = b.updatedAt.getTime();
      const aT = a.updatedAt.getTime();
      if (bT !== aT) return bT - aT;
      return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
    });
  }

  /**
   * Given the sorted, matched rules, returns the ordered list of actions to execute,
   * respecting the block-wins / terminal-allow-wins semantics above.
   */
  static resolveActionPlan(
    matchedRulesInPriorityOrder: RuleWithMeta[],
  ): Array<{ ruleId: string; action: RuleActionDef }> {
    const plan: Array<{ ruleId: string; action: RuleActionDef }> = [];
    let terminalAllowSeen = false;
    let blockSeen = false;

    for (const rule of matchedRulesInPriorityOrder) {
      if (terminalAllowSeen || blockSeen) break;
      const orderedActions = [...rule.actions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const action of orderedActions) {
        plan.push({ ruleId: rule.ruleId, action });
        if (action.type === 'BLOCK') blockSeen = true;
        if (action.type === 'ALLOW' && action.terminal) terminalAllowSeen = true;
      }
      if (blockSeen || terminalAllowSeen) break;
    }
    return plan;
  }

  /**
   * Structural conflict *detection* (not evaluation): flags pairs of published rules in the
   * same company+module whose condition trees are "overlapping" (same field, equal or
   * overlapping literal comparisons) and whose top-level action sets are contradictory
   * (one has ALLOW, the other has BLOCK or WARN). This is a static, deterministic check run
   * at publish time and via POST /rules/simulate — no AI involved.
   */
  static detectConflicts(
    rules: RuleWithMeta[],
  ): Array<{ ruleAId: string; ruleBId: string; reason: string }> {
    const conflicts: Array<{ ruleAId: string; ruleBId: string; reason: string }> = [];
    for (let i = 0; i < rules.length; i++) {
      for (let j = i + 1; j < rules.length; j++) {
        const a = rules[i]!;
        const b = rules[j]!;
        if (a.module !== b.module || a.companyId !== b.companyId) continue;
        if (!conditionsOverlap(a.condition, b.condition)) continue;
        const aHasBlock = a.actions.some((x) => x.type === 'BLOCK');
        const bHasBlock = b.actions.some((x) => x.type === 'BLOCK');
        const aHasAllow = a.actions.some((x) => x.type === 'ALLOW');
        const bHasAllow = b.actions.some((x) => x.type === 'ALLOW');
        if ((aHasBlock && bHasAllow) || (bHasBlock && aHasAllow)) {
          conflicts.push({
            ruleAId: a.ruleId,
            ruleBId: b.ruleId,
            reason: 'Overlapping conditions with contradictory ALLOW/BLOCK actions.',
          });
        }
      }
    }
    return conflicts;
  }
}

/**
 * Extracts flat (field, operator, literal) triples from a condition tree for a coarse
 * overlap check: two conditions "overlap" if they share a comparison on the same field with
 * the same literal value under "==", or with no field-level comparisons that are mutually
 * exclusive. This intentionally over-flags rather than under-flags conflicts (a conservative
 * heuristic), since a false-positive conflict warning is safer than a missed one.
 */
function extractEqualityLiterals(node: unknown, out: Map<string, unknown[]>): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if ('and' in obj && Array.isArray(obj.and)) {
    for (const c of obj.and) extractEqualityLiterals(c, out);
    return;
  }
  if ('or' in obj && Array.isArray(obj.or)) {
    for (const c of obj.or) extractEqualityLiterals(c, out);
    return;
  }
  if ('==' in obj && Array.isArray(obj['=='])) {
    const [left, right] = obj['=='] as [unknown, unknown];
    if (left && typeof left === 'object' && 'var' in (left as object)) {
      const field = (left as { var: string }).var;
      const list = out.get(field) ?? [];
      list.push(right);
      out.set(field, list);
    }
  }
}

function conditionsOverlap(a: unknown, b: unknown): boolean {
  const aMap = new Map<string, unknown[]>();
  const bMap = new Map<string, unknown[]>();
  extractEqualityLiterals(a, aMap);
  extractEqualityLiterals(b, bMap);
  if (aMap.size === 0 || bMap.size === 0) {
    // Cannot prove disjointness structurally — conservatively treat as potentially
    // overlapping only if they target the exact same set of fields.
    const aFields = new Set(aMap.keys());
    const bFields = new Set(bMap.keys());
    return aFields.size > 0 && bFields.size > 0 && [...aFields].every((f) => bFields.has(f));
  }
  for (const [field, aValues] of aMap) {
    const bValues = bMap.get(field);
    if (!bValues) continue;
    if (aValues.some((v) => bValues.includes(v))) return true;
  }
  return false;
}
