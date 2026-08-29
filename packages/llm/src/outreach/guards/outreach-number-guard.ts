import type { ProseField } from '../../prose-fields.js';

/**
 * Same reasoning as executive-summary-digit-guard.ts, generalized to every
 * outreach field rather than one: nothing in outreach prose has a
 * legitimate reason to state a digit. Word counts, sentence counts, prices,
 * WCAG criteria and page counts are either deterministic content spliced
 * outside the model's fields entirely, or explicitly withheld from its
 * input (outreach-input.ts). The allowlist exists for symmetry with a
 * caller that later needs one; none is populated today, so every call site
 * is expected to leave it empty.
 */
export interface OutreachNumberViolation {
  field: string;
  text: string;
  matched: string;
}

const DIGIT_PATTERN = /\d/;

export function findOutreachNumberViolations(
  fields: readonly ProseField[],
  allowlist: readonly string[] = [],
): OutreachNumberViolation[] {
  const violations: OutreachNumberViolation[] = [];

  for (const { field, text } of fields) {
    let stripped = text;
    for (const allowed of allowlist) {
      stripped = stripped.split(allowed).join('');
    }
    const match = stripped.match(DIGIT_PATTERN);
    if (match) violations.push({ field, text, matched: match[0] });
  }

  return violations;
}
