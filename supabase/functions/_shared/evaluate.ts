/**
 * Shared query/rule evaluation engine for sequence conditions.
 *
 * Used by:
 *  - process-sequence-step (runtime condition evaluation)
 *  - dry-run-sequence (simulation condition evaluation)
 *  - check-sequence-health (path-aware expected count calculation)
 */

/**
 * Evaluate a single rule against a data object.
 * If the rule contains a 'combinator', it's treated as a nested query group.
 */
export function evaluateRule(rule: any, data: any): boolean {
  if ('combinator' in rule) {
    return evaluateQuery(rule, data);
  }
  const { field, operator, value } = rule;
  const dataValue = data[field];

  // Handle boolean fields effectively
  if (value === 'true' || value === true) return dataValue === true || String(dataValue).toLowerCase() === 'true';
  if (value === 'false' || value === false) return dataValue === false || String(dataValue).toLowerCase() === 'false';

  switch (operator) {
    case '=': return dataValue == value;
    case '!=': return dataValue != value;
    case '<': return Number(dataValue) < Number(value);
    case '>': return Number(dataValue) > Number(value);
    case '<=': return Number(dataValue) <= Number(value);
    case '>=': return Number(dataValue) >= Number(value);
    case 'contains':
      if (Array.isArray(dataValue)) return dataValue.includes(value);
      return String(dataValue).toLowerCase().includes(String(value).toLowerCase());
    case 'doesNotContain':
      if (Array.isArray(dataValue)) return !dataValue.includes(value);
      return !String(dataValue).toLowerCase().includes(String(value).toLowerCase());
    case 'beginsWith': return String(dataValue).toLowerCase().startsWith(String(value).toLowerCase());
    case 'endsWith': return String(dataValue).toLowerCase().endsWith(String(value).toLowerCase());
    case 'null': return dataValue === null || dataValue === undefined;
    case 'notNull': return dataValue !== null && dataValue !== undefined;
    default: return false;
  }
}

/**
 * Evaluate a query group (with combinator 'and' or 'or') against a data object.
 * Empty or missing rules evaluate to true (no constraints = passes).
 */
export function evaluateQuery(query: any, data: any): boolean {
  if (!query || !query.rules || query.rules.length === 0) return true;

  if (query.combinator === 'and') {
    return query.rules.every((r: any) => evaluateRule(r, data));
  } else {
    return query.rules.some((r: any) => evaluateRule(r, data));
  }
}
