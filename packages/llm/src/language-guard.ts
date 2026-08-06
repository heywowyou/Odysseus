import { franc } from 'franc-min';
import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';

const MIN_CHECKED_LENGTH = 20;
const FRANC_CANDIDATES = ['fra', 'eng'];
const EXPECTED_FRANC_CODE: Record<ReportLanguage, 'fra' | 'eng'> = {
  fr: 'fra',
  en: 'eng',
};

/** The pre-franc regex heuristic, kept around solely as the second vote
 *  in `checkDualDetector` below - see that function's comment for why. */
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
 * Language-compliance guard for the writing pass output, backed by real
 * language detection (`franc-min`'s `franc()`) for most fields, with a
 * second, independent vote required on `title` and `recommendedActions`
 * specifically - see `checkDualDetector` below for why those two need
 * it and the others don't.
 *
 * `franc()` is called with `only: ['fra', 'eng']` rather than its default
 * 82-language candidate set. Restricting the candidates improves
 * accuracy specifically on short strings like theme titles, which franc's
 * own documentation flags as a known weak spot under roughly 50
 * characters - narrowing the field to just the two languages this tool
 * ever writes in reduces how often a short string is misclassified as a
 * third, irrelevant language.
 *
 * Only fields >= MIN_CHECKED_LENGTH characters are checked; below that,
 * franc itself has too little signal to call reliably, so a short field
 * is skipped rather than passed to the detector.
 *
 * `franc()` returns `'und'` when it cannot confidently pick between the
 * two candidates; that is treated as no signal rather than a violation.
 *
 * `legalRelevance` is not checked at all. It's a formulaic citation
 * ("WCAG 2.2 criterion X.X.X (Name)"), confirmed on a live en analysis
 * of almamia.fr to carry near-tied fra/eng scores (0.92-0.98) regardless
 * of correctness - a citation has no language of its own to detect, so
 * any score it gets is noise. Exemption is the correct response to a
 * field with no reliable signal, not a workaround.
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

  /**
   * `title` and `recommendedActions` entries are often short and generic
   * ("Missing image descriptions", "Unstable page layout"), and franc's
   * accuracy on short strings is exactly the weak spot its own docs
   * warn about. A live en analysis of almamia.fr confirmed this for
   * real: ten genuinely-correct short titles and action sentences were
   * flagged, with franc's confidence in the correct language ranging
   * 0.44 to 0.997 against the (wrong) winner's normalized 1 - too wide a
   * spread to separate from a real leak with a confidence threshold. The
   * same run's regression fixture for the original production bug (a
   * fully English title in a French report) scored 0.655 on that same
   * scale, sitting *inside* that false-positive range rather than below
   * it, which is what ruled out a threshold: no single cutoff keeps the
   * real leak flagged while suppressing the false positives.
   *
   * Anchoring these fields to the theme's businessImpact text (an
   * earlier attempt at fixing this) was also rejected: concatenating a
   * short wrong-language title with a longer correct-language
   * businessImpact let the businessImpact's length dominate the
   * combined detection, silently un-flagging a genuine title-only leak -
   * exactly the failure this guard exists to catch.
   *
   * What does separate the two classes on every real example collected
   * across all three diagnosis rounds (see language-guard.test.ts) is
   * requiring franc and the pre-franc regex heuristic (`looksFrench`,
   * `FRENCH_ACCENT_CHARS` / `FRENCH_STOPWORDS`) to independently agree
   * a field is wrong-language before it's flagged. The two detectors
   * fail in different, uncorrelated ways: franc misreads short or
   * generic strings; the regex misses fluent prose with no accented
   * character or listed stopword. A false positive from one detector
   * essentially never survives a second, differently-shaped detector
   * also getting it wrong. `businessImpact`, `executiveSummary`, and
   * `notes` are always full sentences or paragraphs, never
   * length-floor-limited, so they don't show this failure mode and stay
   * on the plain franc-only `check`.
   */
  function checkDualDetector(field: string, text: string): void {
    if (text.length < MIN_CHECKED_LENGTH) return;
    const detected = franc(text, { only: FRANC_CANDIDATES });
    if (detected === 'und') return;
    if (detected === expected) return;

    const isFrench = looksFrench(text);
    const regexMismatch = language === 'fr' ? !isFrench : isFrench;
    if (regexMismatch) violations.push({ field, text });
  }

  check('executiveSummary', output.executiveSummary);
  check('notes', output.notes);
  output.themes.forEach((theme, i) => {
    checkDualDetector(`themes[${i}](${theme.themeKey}).title`, theme.title);
    check(`themes[${i}](${theme.themeKey}).businessImpact`, theme.businessImpact);
    // legalRelevance is intentionally not checked - see the doc comment above.
    theme.recommendedActions.forEach((action, j) => {
      checkDualDetector(`themes[${i}](${theme.themeKey}).recommendedActions[${j}]`, action);
    });
  });

  return violations;
}
