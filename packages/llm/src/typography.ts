import type { ReportLanguage } from '@odysseus/core';
import type { OutreachProseOutput } from './outreach/outreach-schema.js';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * B2.5 (2026-08-24, Domaine Lagnonu). Trade-off 29 replaced 23
 * ordinary-space guillemet pairs with U+00A0 across the report's source
 * strings and added guillemet-spacing.test.ts to scan every source file,
 * because in French an ordinary space inside guillemets is both wrong and
 * a real layout defect (it is a legal line-break opportunity).
 *
 * That guard covers repo strings. It cannot cover model prose, and a real
 * analysis carried 6 model-written strings with an ordinary space inside
 * guillemets and 0 with U+00A0 - the exact defect trade-off 29 fixed,
 * re-entering through the other door. The same run contained an en dash,
 * which the style rules forbid in report copy outright.
 *
 * Normalized rather than rejected, unlike the legal and severity guards:
 * spacing and dash characters carry no meaning the model chose, so
 * rewriting them changes presentation, never a claim. A retry would spend
 * an API call to re-roll wording that was already correct.
 *
 * U+00A0 rather than the typographically finer U+202F, matching
 * trade-off 29's own reasoning: U+202F is missing from some fallback
 * fonts Chromium may reach for during print-to-PDF, and a missing glyph
 * in the PDF text layer is worse than a slightly wide space.
 */
const NBSP = ' ';

export function normalizeReportTypography(text: string, language: ReportLanguage): string {
  let out = text;

  // Em and en dashes are forbidden in report copy (CLAUDE.md style rules).
  // A spaced dash becomes a comma-like pause; an unspaced one (a range,
  // "2-3") becomes a plain hyphen.
  out = out.replace(/\s+[—–]\s+/gu, ' - ').replace(/[—–]/gu, '-');

  if (language === 'fr') {
    // Collapse whatever sits between a guillemet and its content - an
    // ordinary space, an existing NBSP, or nothing - to exactly one NBSP.
    out = out.replace(/«[\s  ]*/gu, `«${NBSP}`).replace(/[\s  ]*»/gu, `${NBSP}»`);
  }

  return out;
}

/** Applies normalizeReportTypography to every prose field of a writing
 *  pass response, leaving structure untouched. */
export function normalizeWritingOutputTypography(
  output: WritingPassOutput,
  language: ReportLanguage,
): WritingPassOutput {
  return {
    ...output,
    executiveSummary: normalizeReportTypography(output.executiveSummary, language),
    notes: normalizeReportTypography(output.notes, language),
    themes: output.themes.map((theme) => ({
      ...theme,
      title: normalizeReportTypography(theme.title, language),
      businessImpact: normalizeReportTypography(theme.businessImpact, language),
      recommendedActions: theme.recommendedActions.map((action) =>
        normalizeReportTypography(action, language),
      ),
    })),
  };
}

/** Applies normalizeReportTypography to every prose field of one outreach
 *  touch's response, keyed on the same touch discriminant outreach-schema.ts
 *  uses elsewhere. Same posture as normalizeWritingOutputTypography: runs
 *  after every rejecting guard in generate-outreach-prose.ts, never before,
 *  so a guard never inspects text this rewrote. */
export function normalizeOutreachOutputTypography(
  output: OutreachProseOutput,
  language: ReportLanguage,
): OutreachProseOutput {
  switch (output.touch) {
    case 1:
      return {
        ...output,
        subject: normalizeReportTypography(output.subject, language),
        opening: normalizeReportTypography(output.opening, language),
        evidenceSentence: normalizeReportTypography(output.evidenceSentence, language),
        question: normalizeReportTypography(output.question, language),
      };
    case 2:
      return {
        ...output,
        sentences: output.sentences.map((sentence) =>
          normalizeReportTypography(sentence, language),
        ),
      };
    case 3:
      return {
        ...output,
        closing: normalizeReportTypography(output.closing, language),
      };
  }
}
