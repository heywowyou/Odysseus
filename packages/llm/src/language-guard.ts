import { franc } from 'franc-min';
import type { ReportLanguage } from '@odysseus/core';
import type { ProseField } from './prose-fields.js';
import type { WritingPassOutput } from './writing-schema.js';

const MIN_CHECKED_LENGTH = 20;
const FRANC_CANDIDATES = ['fra', 'eng'];
const EXPECTED_FRANC_CODE: Record<ReportLanguage, 'fra' | 'eng'> = {
  fr: 'fra',
  en: 'eng',
};

/** The pre-franc regex heuristic, kept around solely as the second vote
 *  in the dual detector below - see `findLanguageComplianceViolationsInFields`
 *  for why. */
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
 * Language-compliance guard over a flat list of prose fields, backed by real
 * language detection (`franc-min`'s `franc()`), with an optional second,
 * independent vote via `options.dualDetect` - see the doc comment this
 * carried before extraction, preserved on `findLanguageComplianceViolations`
 * below, for why the writing pass needs the dual vote on some fields and not
 * others. Outreach prose is uniformly short, which is exactly the franc weak
 * spot the dual detector exists for, so every outreach field requests it.
 *
 * `franc()` is called with `only: ['fra', 'eng']` rather than its default
 * 82-language candidate set, which measurably improves accuracy on short
 * strings. Fields under `MIN_CHECKED_LENGTH` characters are skipped, and a
 * `'und'` result (franc could not confidently pick) is treated as no signal
 * rather than a violation.
 */
export function findLanguageComplianceViolationsInFields(
  fields: readonly ProseField[],
  language: ReportLanguage,
  options: { dualDetect: boolean },
): LanguageComplianceViolation[] {
  const violations: LanguageComplianceViolation[] = [];
  const expected = EXPECTED_FRANC_CODE[language];

  for (const { field, text } of fields) {
    if (text.length < MIN_CHECKED_LENGTH) continue;
    const detected = franc(text, { only: FRANC_CANDIDATES });
    if (detected === 'und') continue;
    if (detected === expected) continue;

    if (!options.dualDetect) {
      violations.push({ field, text });
      continue;
    }

    const isFrench = looksFrench(text);
    const regexMismatch = language === 'fr' ? !isFrench : isFrench;
    if (regexMismatch) violations.push({ field, text });
  }

  return violations;
}

/**
 * Language-compliance guard for the writing pass output. Most fields use
 * plain franc detection; `title` and `recommendedActions` entries require a
 * second, independent vote - a live en analysis of almamia.fr found franc
 * misreads short, generic strings ("Missing image descriptions") often
 * enough that no confidence threshold separates a real leak from a false
 * positive on those two field shapes. `businessImpact`, `executiveSummary`,
 * and `notes` are always full sentences or paragraphs and don't show that
 * failure mode, so they stay on the plain detector.
 *
 * The two detectors fail in different, uncorrelated ways: franc misreads
 * short or generic strings; the regex misses fluent prose with no accented
 * character or listed stopword. A false positive from one essentially never
 * survives a second, differently-shaped detector also getting it wrong.
 * Anchoring short fields to a longer field's text was tried and rejected
 * too: it let the longer field's length dominate the combined detection,
 * silently un-flagging a genuine title-only leak.
 *
 * `legalRelevance` is not checked at all. It's a formulaic citation ("WCAG
 * 2.2 criterion X.X.X (Name)"), confirmed on a live en analysis to carry
 * near-tied fra/eng scores regardless of correctness - a citation has no
 * language of its own to detect, so any score it gets is noise.
 */
export function findLanguageComplianceViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): LanguageComplianceViolation[] {
  const singleDetectFields: ProseField[] = [
    { field: 'executiveSummary', text: output.executiveSummary },
    { field: 'notes', text: output.notes },
    ...output.themes.map((theme, i) => ({
      field: `themes[${i}](${theme.themeKey}).businessImpact`,
      text: theme.businessImpact,
    })),
  ];

  const dualDetectFields: ProseField[] = output.themes.flatMap((theme, i) => [
    { field: `themes[${i}](${theme.themeKey}).title`, text: theme.title },
    // legalRelevance is intentionally not checked - see the doc comment above.
    ...theme.recommendedActions.map((action, j) => ({
      field: `themes[${i}](${theme.themeKey}).recommendedActions[${j}]`,
      text: action,
    })),
  ]);

  return [
    ...findLanguageComplianceViolationsInFields(singleDetectFields, language, {
      dualDetect: false,
    }),
    ...findLanguageComplianceViolationsInFields(dualDetectFields, language, { dualDetect: true }),
  ];
}
