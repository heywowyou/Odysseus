import type { ProseField } from './prose-fields.js';
import type { WritingPassOutput } from './writing-schema.js';

/** The version the scanner's axe tag set actually audits, and the only
 *  version citation prose may carry. Shared with writing-prompt.ts's
 *  instruction so the prompt and the guard state the same number. */
export const REQUIRED_WCAG_VERSION = '2.2';

/**
 * The scanner runs axe against the WCAG 2.2 AA tag set, so every version
 * citation in the report must say 2.2 (docs/llm-layer-rules.md section 6,
 * "Cite WCAG 2.2"). The first live run mixed 2.1 and 2.2 citations: 10
 * "WCAG 2.1" strings against 520 "WCAG 2.2" strings across stored
 * analyses, all 10 in the two 2026-08-02 sas-fernande.fr files. Criterion
 * numbers are identical across versions, so nothing was factually wrong
 * about any single criterion, but a client's developer will notice a
 * report claiming to audit 2.2 while citing 2.1.
 *
 * A guard rather than the existing prompt instruction alone, on the
 * standing reasoning of the language and severity-vocabulary guards: an
 * instruction shapes the model's behaviour, nothing checks whether it
 * held.
 *
 * The patterns must not flag criterion numbers: WCAG criteria are
 * three-part (1.4.3, 2.1.1, 2.1.3), so the bare-version pattern excludes
 * a digit before (1.2.1) and a digit or dot after (2.1.1). A colon after
 * is also excluded so an English contrast ratio like 2.1:1 stays legal.
 * Measured against every stored analysis: these patterns match exactly
 * the 10 known fault strings and no legitimate prose.
 */
const WCAG_VERSION_PATTERNS: RegExp[] = [
  // "WCAG 2.1", "WCAG 2.0", with or without a space.
  /\bWCAG\s*2\.[01](?![.\d])/iu,
  // A bare version reference: "version 2.1", "norme 2.1", "en 2.1".
  /(?<![\d.])2\.[01](?!\.?\d)(?!:)/,
];

export interface WcagCitationViolation {
  field: string;
  text: string;
  matched: string;
}

/** At most one violation per field: the first pattern to match is the one
 *  reported, mirroring findLegalConsequenceViolations' shape. */
export function findWcagCitationViolationsInFields(
  fields: readonly ProseField[],
): WcagCitationViolation[] {
  const violations: WcagCitationViolation[] = [];
  for (const { field, text } of fields) {
    for (const pattern of WCAG_VERSION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        violations.push({ field, text, matched: match[0] });
        break;
      }
    }
  }
  return violations;
}

/** Scans the writing pass's prose fields. legalRelevance is excluded: it
 *  has been built entirely in code (legal-relevance.ts) since
 *  docs/report-v2-refactor.md 4.3, so the model cannot write a version
 *  citation there and the code-built text cites 2.2 by construction.
 *  Theme titles are included like every other model-written field since
 *  the 2026-08-30 pass: their earlier exclusion ("no reader-visible
 *  meaning to check") held only while titles stayed unversioned, and a
 *  title like "Conformite WCAG 2.1" would render as a heading that
 *  contradicts the report's own methodology statement; the stored titles
 *  matched nothing. */
export function findWcagCitationViolations(output: WritingPassOutput): WcagCitationViolation[] {
  const fields: ProseField[] = [
    { field: 'executiveSummary', text: output.executiveSummary },
    { field: 'notes', text: output.notes },
    ...output.themes.flatMap((theme, i) => [
      { field: `themes[${i}](${theme.themeKey}).title`, text: theme.title },
      { field: `themes[${i}](${theme.themeKey}).businessImpact`, text: theme.businessImpact },
      ...theme.recommendedActions.map((action, j) => ({
        field: `themes[${i}](${theme.themeKey}).recommendedActions[${j}]`,
        text: action,
      })),
    ]),
  ];

  return findWcagCitationViolationsInFields(fields);
}
