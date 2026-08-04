import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';

const MIN_CHECKED_LENGTH = 20;
const FRENCH_ACCENT_CHARS = /[éèêàçùôîâœÉÈÊÀÇÙÔÎÂŒ]/;
const FRENCH_STOPWORDS = /\b(le|la|les|de|des|un|une|et|pour|dans|avec|votre|vous|sur)\b/i;

function looksFrench(text: string): boolean {
  return FRENCH_ACCENT_CHARS.test(text) || FRENCH_STOPWORDS.test(text);
}

export interface LanguageComplianceViolation {
  field: string;
  text: string;
}

/**
 * Heuristic language-compliance guard for the writing pass output.
 *
 * THIS IS NOT REAL LANGUAGE DETECTION. It is a cheap regex check, added
 * because the prompt-instruction-only approach documented previously in
 * docs/llm-layer-rules.md section 6 did not hold: a real fr analysis
 * (artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/analyses/2026-08-02T18-28-34Z-fr.json)
 * had every theme.title in English despite the instruction being present
 * in the system prompt at the time.
 *
 * Direction:
 * - language 'fr': flag a field if it does NOT look French (no accented
 *   character, no whole-word French stopword). High confidence - this is
 *   the direction that actually failed in production.
 * - language 'en': flag a field if it DOES look French. Included for
 *   symmetry but LOWER CONFIDENCE - fluent English prose can legitimately
 *   contain a French loanword or proper noun without being wrong-
 *   language. The only observed failure so far is English leaking into
 *   French, not the reverse.
 *
 * Only fields >= MIN_CHECKED_LENGTH characters are checked - short
 * fields carry no reliable signal either way.
 *
 * Known false positives (accepted trade-off): a field just over the
 * length floor with no stopword/accent signal in either language (a
 * proper noun, a URL, a code snippet). Known false negatives (accepted
 * trade-off): fluent wrong-language prose that happens to contain an
 * accented character or a checked stopword (a French place name inside
 * otherwise-English prose; an English sentence using a French loanword).
 * Real language detection was considered and rejected as its own
 * dependency decision - this guard exists to catch one specific,
 * already-observed failure mode, and the retry loop it drives already
 * fails loudly on repeated violations rather than shipping bad prose.
 */
export function findLanguageComplianceViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): LanguageComplianceViolation[] {
  const violations: LanguageComplianceViolation[] = [];

  function check(field: string, text: string): void {
    if (text.length < MIN_CHECKED_LENGTH) return;
    const isFrench = looksFrench(text);
    if (language === 'fr' && !isFrench) violations.push({ field, text });
    if (language === 'en' && isFrench) violations.push({ field, text });
  }

  check('executiveSummary', output.executiveSummary);
  check('notes', output.notes);
  output.themes.forEach((theme, i) => {
    check(`themes[${i}](${theme.themeKey}).title`, theme.title);
    check(`themes[${i}](${theme.themeKey}).businessImpact`, theme.businessImpact);
    if (theme.legalRelevance) {
      check(`themes[${i}](${theme.themeKey}).legalRelevance`, theme.legalRelevance);
    }
    theme.recommendedActions.forEach((action, j) => {
      check(`themes[${i}](${theme.themeKey}).recommendedActions[${j}]`, action);
    });
  });

  return violations;
}
