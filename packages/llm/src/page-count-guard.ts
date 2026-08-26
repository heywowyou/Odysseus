import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * B2.6 (2026-08-24, Domaine Lagnonu). A real report's recommended actions
 * stated page counts that contradicted the deterministic counts rendered
 * on the same card: "les liens repetes sur 18 pages" beside "43 pages sur
 * 43", and three more like it (18 vs 43, 18 vs 37, 12 vs 34).
 *
 * The model cannot possibly know these numbers: build-input.ts truncates
 * each finding to MAX_PAGE_URLS_FOR_LLM (3) page URLs, precisely so a
 * theme spanning 200 pages does not blow the prompt budget. So every page
 * count in its prose is invented, which rule 1 forbids outright.
 *
 * Rejected rather than normalized, and rejected wholesale rather than
 * checked against the true count: there is no correct number for the
 * model to write, so there is nothing to repair. This mirrors
 * executive-summary-digit-guard.ts, which bans digits from the executive
 * summary on the same reasoning - the report template owns the counts and
 * renders them from finding data.
 *
 * Deliberately narrow: only a number immediately qualifying "page(s)" is
 * a violation. Other numbers in recommended actions are legitimate and
 * must keep working ("ratio minimum 4,5:1", "WCAG 2.2", "aria-label").
 */
const PAGE_COUNT_PATTERNS: Record<ReportLanguage, RegExp> = {
  // Matches "18 pages", "les 18 pages", "sur 12 page" - a digit run
  // followed by the page noun, with only spacing between.
  fr: /\b\d[\d\s.,]*\s*pages?\b/iu,
  en: /\b\d[\d\s.,]*\s*pages?\b/iu,
};

export interface PageCountViolation {
  field: string;
  text: string;
  matched: string;
}

function checkField(
  field: string,
  text: string,
  language: ReportLanguage,
  violations: PageCountViolation[],
): void {
  const match = text.match(PAGE_COUNT_PATTERNS[language]);
  if (match) violations.push({ field, text, matched: match[0].trim() });
}

/** Scans the writing pass's prose fields. Theme titles are excluded: they
 *  are short labels, and a count in one would be caught by the same
 *  reader-visible mismatch anyway if it ever appeared. */
export function findPageCountViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): PageCountViolation[] {
  const violations: PageCountViolation[] = [];

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
