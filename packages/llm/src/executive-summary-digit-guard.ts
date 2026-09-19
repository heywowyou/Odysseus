import type { WritingPassOutput } from './writing-schema.js';

/**
 * report-feedback-la-corniche.md item 0.4: the writing pass used to be
 * asked to cite exact siteStats figures in executiveSummary, and those
 * figures could drift from the report's final bound counts whenever
 * something at render time (lcen-resolution.ts's manual SIREN-source-url
 * removal, concretely) changed the finding set after the writing pass
 * already ran - a real report stated "94 constats, 66 problèmes
 * prioritaires (33 critiques et 33 sérieux)" in this sentence while the
 * cover, stats tile, and severity chart all said 93 / 65 / 32. The fix
 * moves every count in this sentence into the report template
 * (executive-summary.ts's summaryCountsTemplate, bound from the same
 * resolvedFindings every other count reads), so the writing pass has no
 * legitimate reason left to write an audit count anywhere in
 * executiveSummary. A French or English arrondissement ordinal is the
 * narrow exception: it identifies a Paris location, not an audit quantity,
 * and its number cannot drift from a report statistic.
 * Scoped to that one field only: recommendedActions is explicitly
 * allowed to state a page count (the prompt's own "18 pages" example),
 * and businessImpact/notes have no equivalent drift risk since nothing
 * else in the report echoes their content back as a bound value.
 *
 * A plain digit scan, not a second model call, same "no legitimate
 * reason for this pattern to appear" reasoning as the severity-vocabulary
 * guard (severity-vocabulary-guard.ts) uses for banned synonyms.
 */
const DIGIT_PATTERN = /\d/;
const ARRONDISSEMENT_ORDINAL_PATTERN =
  /\b\d{1,2}(?:er|e|ème|eme|st|nd|rd|th)\s+arrondissement\b/giu;

export interface ExecutiveSummaryDigitViolation {
  field: 'executiveSummary';
  text: string;
}

export function hasExecutiveSummaryDigitViolation(text: string): boolean {
  const withoutLocationOrdinals = text.replace(ARRONDISSEMENT_ORDINAL_PATTERN, 'arrondissement');
  return DIGIT_PATTERN.test(withoutLocationOrdinals);
}

export function findExecutiveSummaryDigitViolations(
  output: WritingPassOutput,
): ExecutiveSummaryDigitViolation[] {
  if (hasExecutiveSummaryDigitViolation(output.executiveSummary)) {
    return [{ field: 'executiveSummary', text: output.executiveSummary }];
  }
  return [];
}
