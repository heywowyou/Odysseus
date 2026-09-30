import type { FindingCategory, ReportLanguage, WritingSanitizationWarning } from '@odysseus/core';
import { findBusinessClaimViolationsInFields } from './business-claim-guard.js';
import { findLegalConsequenceViolationsInFields } from './legal-consequence-guard.js';
import { hasPageCountViolation } from './page-count-guard.js';
import {
  ratesSevereMetricGood,
  SUPPRESSED_ACTION_PATTERNS,
  SUPPRESSED_METRIC_PATTERNS,
  tiesFieldDataToOnePage,
} from './performance-evidence-guard.js';
import { hasFindingCountViolation } from './finding-count-guard.js';
import { hasExecutiveSummaryDigitViolation } from './executive-summary-digit-guard.js';
import { hasInternalReference } from './internal-reference-guard.js';
import {
  writingPassOutputSchema,
  type WritingInput,
  type WritingPassOutput,
  type WritingPerformanceMetric,
} from './writing-schema.js';

function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function businessViolation(text: string, field: string, language: ReportLanguage): boolean {
  return findBusinessClaimViolationsInFields([{ field, text }], language).length > 0;
}

function legalViolation(text: string, field: string, language: ReportLanguage): boolean {
  return findLegalConsequenceViolationsInFields([{ field, text }], language).length > 0;
}

function hasSuppressedMetric(
  text: string,
  language: ReportLanguage,
  suppressed: readonly WritingPerformanceMetric[],
  inRecommendedAction: boolean,
): boolean {
  return suppressed.some(
    (metric) =>
      SUPPRESSED_METRIC_PATTERNS[language][metric].test(text) ||
      (inRecommendedAction && SUPPRESSED_ACTION_PATTERNS[language][metric]?.test(text) === true),
  );
}

function sanitizePerformanceSentences(
  text: string,
  field: string,
  language: ReportLanguage,
  suppressed: readonly WritingPerformanceMetric[],
  warnings: WritingSanitizationWarning[],
  inRecommendedAction = false,
): string {
  const kept: string[] = [];
  for (const sentence of sentences(text)) {
    if (hasSuppressedMetric(sentence, language, suppressed, inRecommendedAction)) {
      warning(warnings, 'performance-contradiction-removed', field);
      continue;
    }
    kept.push(sentence);
  }
  return kept.join(' ').trim();
}

function warning(
  warnings: WritingSanitizationWarning[],
  code: WritingSanitizationWarning['code'],
  field: string,
): void {
  if (!warnings.some((entry) => entry.code === code && entry.field === field)) {
    warnings.push({ code, field });
  }
}

function sanitizeSentences(
  text: string,
  field: string,
  language: ReportLanguage,
  warnings: WritingSanitizationWarning[],
  severeMetrics: readonly WritingPerformanceMetric[] = [],
): string {
  const kept: string[] = [];
  for (const sentence of sentences(text)) {
    if (
      ratesSevereMetricGood(sentence, language, severeMetrics) ||
      tiesFieldDataToOnePage(sentence, language)
    ) {
      warning(warnings, 'performance-contradiction-removed', field);
      continue;
    }
    if (businessViolation(sentence, field, language)) {
      warning(warnings, 'business-claim-removed', field);
      continue;
    }
    if (legalViolation(sentence, field, language)) {
      warning(warnings, 'legal-claim-removed', field);
      continue;
    }
    if (
      hasPageCountViolation(sentence, language) ||
      hasFindingCountViolation(sentence, language) ||
      (field === 'executiveSummary' && hasExecutiveSummaryDigitViolation(sentence))
    ) {
      warning(warnings, 'deterministic-count-removed', field);
      continue;
    }
    if (hasInternalReference(sentence)) {
      warning(warnings, 'internal-reference-removed', field);
      continue;
    }
    kept.push(sentence);
  }
  return kept.join(' ').trim();
}

/** Issue #505: the sentence that replaces a business impact the guards
 *  stripped entirely. Only accessibility findings describe visitors who
 *  cannot use interface elements; for any other category that claim is
 *  unsupported (product rule 1), so they get a neutral pointer to the
 *  findings. Exhaustive over FindingCategory, so a new category must choose. */
const NEUTRAL_FALLBACK_IMPACT = {
  fr: 'Les constats de ce thème et les pages concernées sont détaillés dans ce rapport.',
  en: 'This theme’s findings and the pages concerned are detailed in this report.',
} as const;

const FALLBACK_IMPACT: Record<FindingCategory, Record<ReportLanguage, string>> = {
  accessibility: {
    fr: 'Les constats de ce thème limitent directement l’utilisation des éléments concernés pour les visiteurs affectés.',
    en: 'The findings in this theme directly limit use of the affected interface elements for impacted visitors.',
  },
  seo: NEUTRAL_FALLBACK_IMPACT,
  geo: NEUTRAL_FALLBACK_IMPACT,
  performance: NEUTRAL_FALLBACK_IMPACT,
  rendering: NEUTRAL_FALLBACK_IMPACT,
  privacy: NEUTRAL_FALLBACK_IMPACT,
};

function fallbackImpact(language: ReportLanguage, category: FindingCategory | undefined): string {
  return (category === undefined ? NEUTRAL_FALLBACK_IMPACT : FALLBACK_IMPACT[category])[language];
}

function fallbackSummary(language: ReportLanguage): string {
  return language === 'fr'
    ? 'La synthèse reste limitée aux constats et aux mesures déterministes présentés dans le rapport.'
    : 'The summary remains limited to the findings and deterministic measurements presented in the report.';
}

function fallbackAction(language: ReportLanguage): string {
  return language === 'fr'
    ? 'Corrigez le comportement décrit par les constats de ce thème sans modifier les autres éléments conformes.'
    : 'Correct the behavior described by this theme’s findings without changing unrelated conforming elements.';
}

export interface SanitizedWritingOutput {
  output: WritingPassOutput;
  warnings: readonly WritingSanitizationWarning[];
}

/**
 * Plan 067 local semantic repair.
 *
 * Only the offending sentence/action is removed. Unrelated fields are copied
 * byte-for-byte. The function never calls a model and never changes structure,
 * ranking, finding IDs, or deterministic evidence.
 */
export function sanitizeWritingOutput(
  input: WritingInput,
  raw: WritingPassOutput,
): SanitizedWritingOutput {
  const warnings: WritingSanitizationWarning[] = [];
  const inputByKey = new Map(input.themes.map((theme) => [theme.themeKey, theme]));
  const severeMetrics = input.performanceEvidence.severeFindingMetrics ?? [];

  const sanitizedSummary = sanitizeSentences(
    raw.executiveSummary,
    'executiveSummary',
    input.language,
    warnings,
    severeMetrics,
  );
  const executiveSummary =
    sanitizePerformanceSentences(
      sanitizedSummary,
      'executiveSummary',
      input.language,
      input.performanceEvidence.suppressedLabRecommendations,
      warnings,
    ) || fallbackSummary(input.language);
  const notes = sanitizeSentences(raw.notes, 'notes', input.language, warnings, severeMetrics);

  const themes = raw.themes.map((theme, themeIndex) => {
    const source = inputByKey.get(theme.themeKey);
    const impactField = `themes[${themeIndex}](${theme.themeKey}).businessImpact`;
    const semanticImpact = sanitizeSentences(
      theme.businessImpact,
      impactField,
      input.language,
      warnings,
      severeMetrics,
    );
    const businessImpact =
      (source?.category === 'performance'
        ? sanitizePerformanceSentences(
            semanticImpact,
            impactField,
            input.language,
            input.performanceEvidence.suppressedLabRecommendations,
            warnings,
          )
        : semanticImpact) || fallbackImpact(input.language, source?.category);

    const recommendedActions: string[] = [];
    for (const [actionIndex, action] of theme.recommendedActions.entries()) {
      const field = `themes[${themeIndex}](${theme.themeKey}).recommendedActions[${actionIndex}]`;
      let sanitized = sanitizeSentences(action, field, input.language, warnings, severeMetrics);
      if (sanitized && source?.category === 'performance') {
        sanitized = sanitizePerformanceSentences(
          sanitized,
          field,
          input.language,
          input.performanceEvidence.suppressedLabRecommendations,
          warnings,
          true,
        );
      }
      if (sanitized) recommendedActions.push(sanitized);
    }

    if (recommendedActions.length === 0) {
      const trusted = source?.trustedRemediations[0]?.guidance;
      recommendedActions.push(trusted ?? fallbackAction(input.language));
    }

    return {
      ...theme,
      businessImpact,
      recommendedActions: recommendedActions.slice(0, 4),
    };
  });

  return {
    output: writingPassOutputSchema.parse({
      ...raw,
      executiveSummary,
      notes,
      themes,
    }),
    warnings,
  };
}
