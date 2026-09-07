import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * Plan 028. Audit-rehearsal notes recorded reports that contradicted
 * their own finding counts in prose - "80 findings" in one place, "63
 * critiques et 19 sérieux" in another, on the same report. The writing
 * pass has no legitimate way to know a true total: build-input.ts
 * filters findings to LLM_SEVERITY_FLOOR and truncates each finding's
 * page list before the model ever sees it, so any count it writes is
 * either invented outright or a count of the truncated slice it was
 * shown, not the report's real number.
 *
 * This is page-count-guard.ts's exact reasoning, generalized: that guard
 * only matches a digit next to "page(s)", so a digit next to the
 * finding noun or a severity word ("89 constats", "63 critiques", "18
 * findings") passed it silently. The report template already owns and
 * renders every one of these counts (WritingSiteStats, the stats box,
 * the severity chart); the writing pass has nothing to add by repeating
 * one, correctly or not.
 *
 * Rejected rather than normalized, like page-count-guard.ts: there is no
 * correct number for the model to substitute, so there is nothing to
 * repair - only something to remove and let the model rewrite around.
 */
const FINDING_COUNT_PATTERNS: Record<ReportLanguage, RegExp> = {
  // Matches "89 constats", "63 critiques", "12 constats mineurs" - a
  // digit run followed by the finding noun or a canonical severity word,
  // with only spacing between. Deliberately does not match a bare digit
  // next to an unrelated noun ("ratio 4,5:1", "WCAG 2.2").
  fr: /\b\d[\d\s.,]*\s*(constats?|critiques?|sérieux|modérés?|mineurs?)\b/iu,
  en: /\b\d[\d\s.,]*\s*(findings?|critical|serious|moderate|minor)\b/iu,
};

export interface FindingCountViolation {
  field: string;
  text: string;
  matched: string;
}

function checkField(
  field: string,
  text: string,
  language: ReportLanguage,
  violations: FindingCountViolation[],
): void {
  const match = text.match(FINDING_COUNT_PATTERNS[language]);
  if (match) violations.push({ field, text, matched: match[0].trim() });
}

/** Scans the writing pass's prose fields. executiveSummary is already
 *  covered by executive-summary-digit-guard.ts's total digit ban, but is
 *  checked here too for a clearer failure reason when both would fire;
 *  the retry loop only records one reason per attempt regardless (see
 *  analyze-writing.ts's guard ordering comment). Theme titles are
 *  excluded, same reasoning as page-count-guard.ts: a short label. */
export function findFindingCountViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): FindingCountViolation[] {
  const violations: FindingCountViolation[] = [];

  checkField('executiveSummary', output.executiveSummary, language, violations);
  checkField('notes', output.notes, language, violations);
  output.themes.forEach((theme, i) => {
    checkField(
      `themes[${i}](${theme.themeKey}).businessImpact`,
      theme.businessImpact,
      language,
      violations,
    );
    theme.recommendedActions.forEach((action, j) => {
      checkField(
        `themes[${i}](${theme.themeKey}).recommendedActions[${j}]`,
        action,
        language,
        violations,
      );
    });
  });

  return violations;
}
