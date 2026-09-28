import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';
import { unicodeWords } from './unicode-word-boundary.js';

/**
 * Plan 028. Audit-rehearsal notes recorded "la priorité 1 ci-dessus"
 * pointing at content that actually rendered below it, recurring across
 * three different hotel reports - the writing pass has no visibility
 * into final page layout (paged.css lays out themes after the fact, and
 * a theme can move relative to the client's own read order once
 * pagination and the appendix are applied), so any claim about where
 * something sits on the page is a guess the model cannot back up.
 *
 * Scoped narrowly to the document-positional deictics themselves
 * ("ci-dessus"/"ci-dessous", "above"/"below" used as a reference to
 * other report content) rather than a bare ban on "above"/"below",
 * which have legitimate technical uses this guard must not catch (a
 * contrast ratio "en dessous du seuil requis", a metric "above the
 * recommended threshold"). French "ci-dessus"/"ci-dessous" are
 * themselves specifically document-reference words with no other
 * reading, so they are banned outright; English needs the referencing
 * phrase, not the bare word.
 */
const POSITIONAL_REFERENCE_PATTERNS: Record<ReportLanguage, RegExp> = {
  fr: unicodeWords(/\bci-dessus\b|\bci-dessous\b/iu),
  en: unicodeWords(
    /\b(?:as (?:noted|stated|shown|outlined|described|mentioned) (?:above|below)|(?:the|this) (?:theme|priority|finding|section)s? (?:above|below)|above-mentioned|(?:the|see) above|(?:the|see) below)\b/iu,
  ),
};

export interface PositionalReferenceViolation {
  field: string;
  text: string;
  matched: string;
}

function checkField(
  field: string,
  text: string,
  language: ReportLanguage,
  violations: PositionalReferenceViolation[],
): void {
  const match = text.match(POSITIONAL_REFERENCE_PATTERNS[language]);
  if (match) violations.push({ field, text, matched: match[0].trim() });
}

/** Scans every prose field the writing pass produces, including theme
 *  titles: unlike a page or finding count, a positional reference is
 *  exactly as broken in a five-word title as in a full sentence. */
export function findPositionalReferenceViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): PositionalReferenceViolation[] {
  const violations: PositionalReferenceViolation[] = [];

  checkField('executiveSummary', output.executiveSummary, language, violations);
  checkField('notes', output.notes, language, violations);
  output.themes.forEach((theme, i) => {
    checkField(`themes[${i}](${theme.themeKey}).title`, theme.title, language, violations);
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
