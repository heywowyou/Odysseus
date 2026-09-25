import type { ProseField } from './prose-fields.js';

/**
 * Plan 070 slice A. The writing pass is shown each theme under a
 * code-assigned `themeKey` ("t1", "t2", ...) so its response can be
 * correlated back onto the structure. The key is never merged into the
 * stored analysis, so a sentence that names it ("Le thème t3 s'appuie sur
 * ...") points the client at an identifier that appears nowhere in the
 * report.
 *
 * Measured on the stored analyses under artifacts/ on 2026-09-19: two
 * occurrences, both in the notes of one French report, and no other match
 * of this pattern in any prose field of any language, so the check has no
 * recorded false positive. Lowercase only: an uppercase "T2" is the French
 * name of a two-room apartment, which a hotel may legitimately mention.
 */
const INTERNAL_THEME_KEY_PATTERN = /(?<![\p{L}\p{N}_-])t\d{1,2}(?![\p{L}\p{N}_-])/u;

/**
 * Issue #507: the writing input also shows the model each finding's real ID
 * (`f` plus at least three digits, finding-id.ts). The report prints its own
 * finding references, deterministically and linked to their annex rows; an
 * ID inside model prose ("(f012, f013)") is neither: nothing checks it names
 * a finding of that theme, or one at all, and it links nowhere. The sentence
 * is dropped like a theme-key one. Measured on the committed test-audit
 * analyses on 2026-09-25: no match in any prose field (IDs appear only in the
 * structured quickWins lists). Lowercase only, and not the structure pass's
 * `x` aliases: "x2" is ordinary French.
 */
const INTERNAL_FINDING_ID_PATTERN = /(?<![\p{L}\p{N}_-])f\d{3,5}(?![\p{L}\p{N}_-])/u;

const INTERNAL_REFERENCE_PATTERNS = [INTERNAL_THEME_KEY_PATTERN, INTERNAL_FINDING_ID_PATTERN];

export interface InternalReferenceViolation {
  field: string;
  matched: string;
}

/** A theme key or a finding ID, neither of which the client ever sees. */
export function hasInternalReference(text: string): boolean {
  return INTERNAL_REFERENCE_PATTERNS.some((pattern) => pattern.test(text));
}

export function findInternalReferenceViolationsInFields(
  fields: readonly ProseField[],
): InternalReferenceViolation[] {
  const violations: InternalReferenceViolation[] = [];
  for (const { field, text } of fields) {
    for (const pattern of INTERNAL_REFERENCE_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        violations.push({ field, matched: match[0] });
        break;
      }
    }
  }
  return violations;
}
