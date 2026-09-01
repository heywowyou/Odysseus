import type { ReportLanguage } from '@odysseus/core';
import type { WritingPassOutput } from './writing-schema.js';

/**
 * The report's canonical severity vocabulary (the tile labels in
 * packages/report/src/template/strings/{fr,en}.ts), duplicated here
 * deliberately: packages/llm depends on @odysseus/core only, never on
 * packages/report, so this guard owns its own small copy of the four
 * words per language rather than reaching across that boundary. Same
 * "duplicate a small table near a boundary, document why" precedent as
 * packages/report's own EFFECTIF_BAND_LABELS_EN in methodology.ts.
 */
export const SEVERITY_VOCABULARY: Record<
  ReportLanguage,
  { critical: string; serious: string; moderate: string; minor: string }
> = {
  fr: { critical: 'critique', serious: 'sérieux', moderate: 'modéré', minor: 'mineur' },
  en: { critical: 'critical', serious: 'serious', moderate: 'moderate', minor: 'minor' },
};

/** item 3.7 (La Corniche pass): same duplication precedent as
 *  SEVERITY_VOCABULARY above (packages/report/src/template/strings/
 *  {fr,en}.ts's findingSingular/findingPlural), for the noun the model
 *  must use consistently rather than reaching for a synonym like
 *  "problème"/"problem" or "issue". */
export const FINDING_NOUN_VOCABULARY: Record<ReportLanguage, { singular: string; plural: string }> =
  {
    fr: { singular: 'constat', plural: 'constats' },
    en: { singular: 'finding', plural: 'findings' },
  };

/**
 * Known synonyms the model reaches for instead of the canonical word,
 * confirmed against a real response (haaitza.com, 2026-08-08 full audit):
 * the executive summary wrote "26 sérieux" while the stats box and annex
 * both said "majeurs" for the same count, reading as two different
 * classification systems to a legal reader comparing the two.
 *
 * report-feedback-haaitza.md B3 (2026-08-17) traced this the rest of the
 * way: the report's own canonical label (docs/report/report-design-system.md,
 * strings/fr.ts) had already been corrected to "Sérieux", so this guard
 * was banning the correct word and permitting the wrong one - the exact
 * inverse of what it was built to catch. "Majeur" is now the banned
 * synonym.
 *
 * Checked with a plain word-boundary scan, not a second model call: an
 * accessibility/SEO audit report has no legitimate reason to use these
 * words, so a match is treated as a vocabulary violation the same way an
 * invented finding ID is treated as a rejection, not a maybe.
 *
 * Exported for severity-vocabulary-guard.test.ts's sync test with
 * BANNED_SEVERITY_SYNONYMS below; the prompt reads only the display-word
 * table.
 */
export const BANNED_SYNONYMS: Record<ReportLanguage, RegExp[]> = {
  fr: [
    /\bmajeur\b/i,
    /\bmajeurs\b/i,
    /\bmajeure\b/i,
    /\bmajeures\b/i,
    /\bgrave\b/i,
    /\bgraves\b/i,
    /\bsévère\b/i,
    /\bsévères\b/i,
    /\banodine?s?\b/i,
  ],
  en: [/\bmajor\b/i, /\bsevere\b/i, /\btrivial\b/i, /\bnegligible\b/i],
};

/**
 * The same synonyms in display form, for the writing prompt to name
 * explicitly (issue #21: a French run was rejected for "graves" eight
 * consecutive attempts that never saw which words are banned, so the
 * model could only avoid them by luck). The guard's rejecting behaviour
 * is unchanged by these exports. severity-vocabulary-guard.test.ts holds
 * the two tables together in both directions: every word in
 * BANNED_SEVERITY_SYNONYMS is matched by a BANNED_SYNONYMS pattern (so
 * the prompt never names a word the guard permits), and every pattern
 * matches at least one listed word (so no banned shape goes unmentioned).
 */
export const BANNED_SEVERITY_SYNONYMS: Record<ReportLanguage, string[]> = {
  fr: [
    'majeur',
    'majeurs',
    'majeure',
    'majeures',
    'grave',
    'graves',
    'sévère',
    'sévères',
    'anodin',
    'anodins',
    'anodine',
    'anodines',
  ],
  en: ['major', 'severe', 'trivial', 'negligible'],
};

export interface SeverityVocabularyViolation {
  field: string;
  text: string;
  matched: string;
}

function checkField(
  field: string,
  text: string,
  language: ReportLanguage,
  violations: SeverityVocabularyViolation[],
): void {
  for (const pattern of BANNED_SYNONYMS[language]) {
    const match = text.match(pattern);
    if (match) {
      violations.push({ field, text, matched: match[0] });
      return;
    }
  }
}

/** Mirrors findLanguageComplianceViolations' shape (language-guard.ts):
 *  scans every writing-pass prose field for a severity-word synonym that
 *  would drift from the canonical critique/sérieux/modéré/mineur (or
 *  critical/serious/moderate/minor) vocabulary used everywhere else in
 *  the report - the stats box, the annex, the WCAG criteria table, and
 *  the theme titles, which the language guard has always covered and
 *  which render as headings beside that same canonical vocabulary. */
export function findSeverityVocabularyViolations(
  output: WritingPassOutput,
  language: ReportLanguage,
): SeverityVocabularyViolation[] {
  const violations: SeverityVocabularyViolation[] = [];

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
