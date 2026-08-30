import type { ReportLanguage } from '@odysseus/core';
import type { ProseField } from './prose-fields.js';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * CLAUDE.md rule 6 and docs/rules/obligation-basis.md section 7 forbid stating
 * a legal consequence for a specific client: no verdict on whether a law
 * binds them, no deadline, no sanction. Trade-off 11 settled the same
 * question for Argument B by withholding the pen entirely, and trade-off
 * 28 withheld the LCEN sanction ceiling from every render path and
 * guarded it with a test.
 *
 * That guard covers the sanction *amount* coming out of regimes.ts. It
 * does not cover the model asserting in prose that a sanction exists,
 * which is what a real Domaine Lagnonu report did on 2026-08-24: page 8
 * carried "L'absence de numero SIREN ou RCS expose a une amende", plus
 * two "risques juridiques" claims in the executive summary and priority
 * 1, all three rendered into the client PDF.
 *
 * Checked rather than assumed: the writing prompt did not forbid this at
 * the time, it simply never mentioned legal consequence at all - it only
 * said legalRelevance is decided outside the pass. A prompt line was
 * added alongside this guard, but the guard is the enforcement, on the
 * standing reasoning that a legal claim is too costly to leave to an
 * instruction the model may or may not follow (trade-offs 11 and 27).
 *
 * Scanned with a plain pattern rather than a second model call, on
 * severity-vocabulary-guard.ts's reasoning: an audit report has no
 * legitimate reason to reach for this vocabulary, since the only place
 * legal consequence may be discussed is the deterministic splice in
 * section 03, which the model never writes. Reused by the outreach path
 * with the same regex table and one-per-field early return, on the same
 * reasoning: the outreach prompt withholds the pen from legal content
 * entirely (docs/rules/outreach-rules.md section 5), so the model has no more
 * legitimate reason to reach for this vocabulary there than it does here.
 */
const LEGAL_CONSEQUENCE_PATTERNS: Record<ReportLanguage, RegExp[]> = {
  fr: [
    /\bamendes?\b/i,
    /\bsanctions?\b/i,
    /\bp[ée]nalit[ée]s?\b/i,
    /\bpoursuites?\b/i,
    /\brisques? juridiques?\b/i,
    /\bcontentieux\b/i,
    /\bmise en demeure\b/i,
    /\bill[ée]gal\w*\b/i,
    /\bpassible\b/i,
    /\bobligatoire l[ée]galement\b/i,
  ],
  en: [
    /\bfines?\b/i,
    /\bsanctions?\b/i,
    /\bpenalt(?:y|ies)\b/i,
    /\bprosecut\w*\b/i,
    /\blegal risks?\b/i,
    /\blitigation\b/i,
    /\bliable\b/i,
    /\bunlawful\b/i,
    /\billegal\w*\b/i,
    /\blegally required\b/i,
  ],
};

export interface LegalConsequenceViolation {
  field: string;
  text: string;
  matched: string;
}

/** At most one violation per field - the first pattern to match is the one
 *  reported, mirroring findSeverityVocabularyViolations' shape. */
export function findLegalConsequenceViolationsInFields(
  fields: readonly ProseField[],
  language: ReportLanguage,
): LegalConsequenceViolation[] {
  const violations: LegalConsequenceViolation[] = [];
  for (const { field, text } of fields) {
    for (const pattern of LEGAL_CONSEQUENCE_PATTERNS[language]) {
      const match = text.match(pattern);
      if (match) {
        violations.push({ field, text, matched: match[0] });
        break;
      }
    }
  }
  return violations;
}

/** Mirrors findSeverityVocabularyViolations' shape and covers the same
 *  prose fields, which are exactly the fields a real report rendered a
 *  sanction claim in, plus theme titles: a title renders as a heading on
 *  the executive summary and the theme card, so a sanction word in one is
 *  as client-visible as a sanction word in prose. */
export function findLegalConsequenceViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): LegalConsequenceViolation[] {
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

  return findLegalConsequenceViolationsInFields(fields, language);
}
