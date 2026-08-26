import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * CLAUDE.md rule 6 and docs/obligation-basis.md section 7 forbid stating
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
 * section 03, which the model never writes.
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

function checkField(
  field: string,
  text: string,
  language: ReportLanguage,
  violations: LegalConsequenceViolation[],
): void {
  for (const pattern of LEGAL_CONSEQUENCE_PATTERNS[language]) {
    const match = text.match(pattern);
    if (match) {
      violations.push({ field, text, matched: match[0] });
      return;
    }
  }
}

/** Mirrors findSeverityVocabularyViolations' shape and covers the same
 *  prose fields, which are exactly the fields a real report rendered a
 *  sanction claim in. */
export function findLegalConsequenceViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): LegalConsequenceViolation[] {
  const violations: LegalConsequenceViolation[] = [];

  checkField('executiveSummary', output.executiveSummary, language, violations);
  checkField('notes', output.notes, language, violations);
  output.themes.forEach((theme, i) => {
    checkField(`themes[${i}](${theme.themeKey}).businessImpact`, theme.businessImpact, language, violations);
    theme.recommendedActions.forEach((action, j) => {
      checkField(`themes[${i}](${theme.themeKey}).recommendedActions[${j}]`, action, language, violations);
    });
  });

  return violations;
}
