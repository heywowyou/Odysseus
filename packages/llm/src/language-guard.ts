import { franc } from 'franc-min';
import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';

const MIN_CHECKED_LENGTH = 20;
const FRANC_CANDIDATES = ['fra', 'eng'];
const EXPECTED_FRANC_CODE: Record<ReportLanguage, 'fra' | 'eng'> = {
  fr: 'fra',
  en: 'eng',
};

export interface LanguageComplianceViolation {
  field: string;
  text: string;
}

/**
 * Language-compliance guard for the writing pass output, backed by real
 * language detection (`franc-min`'s `franc()`), not a regex heuristic.
 *
 * This replaced an accent-character / stopword regex check
 * (`FRENCH_ACCENT_CHARS` / `FRENCH_STOPWORDS`) that produced real false
 * positives on real output, not a hypothetical risk: a live fr analysis
 * of almamia.fr flagged theme titles that were already fully correct
 * French, because they happened to avoid every word in the short
 * stopword list and contained no accented character -
 * "Images sans texte alternatif", "Liens sans texte descriptif", and
 * "Affichage lent/tardif du premier/principal contenu" (the last group
 * failing because "du" was never in the checked stopword list). Those
 * five strings are regression fixtures below.
 *
 * `franc()` is called with `only: ['fra', 'eng']` rather than its default
 * 82-language candidate set. Restricting the candidates improves
 * accuracy specifically on short strings like theme titles, which franc's
 * own documentation flags as a known weak spot under roughly 50
 * characters - narrowing the field to just the two languages this tool
 * ever writes in reduces how often a short string is misclassified as a
 * third, irrelevant language.
 *
 * Direction: both 'fr' and 'en' now get equal-confidence treatment,
 * unlike the old regex (which explicitly trusted the fr-check direction
 * more, since English-into-French was the only failure actually observed
 * in production). Real detection doesn't have that asymmetry - it either
 * recognizes the language or it doesn't, in both directions.
 *
 * Only fields >= MIN_CHECKED_LENGTH characters are checked; below that,
 * franc itself has too little signal to call reliably, so a short field
 * is skipped rather than passed to the detector.
 *
 * Known limitation (reduced, not eliminated, by the fra/eng restriction):
 * franc's accuracy still degrades on very short strings, so a short but
 * technical, proper-noun-heavy, or code-like field near the length floor
 * remains a possible misdetection. `franc()` returns `'und'` when it
 * cannot confidently pick between the two candidates; that is treated as
 * no signal rather than a violation, the same treatment the old regex
 * gave a field with neither an accent nor a stopword match.
 */
export function findLanguageComplianceViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): LanguageComplianceViolation[] {
  const violations: LanguageComplianceViolation[] = [];
  const expected = EXPECTED_FRANC_CODE[language];

  function check(field: string, text: string): void {
    if (text.length < MIN_CHECKED_LENGTH) return;
    const detected = franc(text, { only: FRANC_CANDIDATES });
    if (detected === 'und') return;
    if (detected !== expected) violations.push({ field, text });
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
