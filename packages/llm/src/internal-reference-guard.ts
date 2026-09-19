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

export interface InternalReferenceViolation {
  field: string;
  matched: string;
}

export function hasInternalThemeKeyReference(text: string): boolean {
  return INTERNAL_THEME_KEY_PATTERN.test(text);
}

export function findInternalReferenceViolationsInFields(
  fields: readonly ProseField[],
): InternalReferenceViolation[] {
  const violations: InternalReferenceViolation[] = [];
  for (const { field, text } of fields) {
    const match = text.match(INTERNAL_THEME_KEY_PATTERN);
    if (match) violations.push({ field, matched: match[0] });
  }
  return violations;
}
