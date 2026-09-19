import type { ReportLanguage, WritingSanitizationWarning } from '@odysseus/core';
import { findBusinessClaimViolationsInFields } from './business-claim-guard.js';
import { findLegalConsequenceViolationsInFields } from './legal-consequence-guard.js';
import {
  writingPassOutputSchema,
  type WritingInput,
  type WritingPassOutput,
  type WritingPerformanceMetric,
} from './writing-schema.js';

const METRIC_PATTERNS: Record<ReportLanguage, Record<WritingPerformanceMetric, RegExp>> = {
  fr: {
    lcp: /\b(?:LCP|Largest Contentful Paint)\b|contenu\s+principal/iu,
    cls: /\b(?:CLS|Cumulative Layout Shift)\b|stabilit[ée]\s+visuelle|d[ée]calages?\s+visuels?/iu,
    inp: /\b(?:INP|Interaction to Next Paint)\b|r[ée]activit[ée]\s+aux\s+interactions?/iu,
    tbt: /\b(?:TBT|Total Blocking Time)\b|scripts?\s+bloquants?/iu,
  },
  en: {
    lcp: /\b(?:LCP|Largest Contentful Paint)\b|main\s+content\s+load/iu,
    cls: /\b(?:CLS|Cumulative Layout Shift)\b|visual\s+stability|layout\s+shift/iu,
    inp: /\b(?:INP|Interaction to Next Paint)\b|interaction\s+responsiveness/iu,
    tbt: /\b(?:TBT|Total Blocking Time)\b|blocking\s+scripts?/iu,
  },
};

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
): boolean {
  return suppressed.some((metric) => METRIC_PATTERNS[language][metric].test(text));
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
): string {
  const kept: string[] = [];
  for (const sentence of sentences(text)) {
    if (businessViolation(sentence, field, language)) {
      warning(warnings, 'business-claim-removed', field);
      continue;
    }
    if (legalViolation(sentence, field, language)) {
      warning(warnings, 'legal-claim-removed', field);
      continue;
    }
    kept.push(sentence);
  }
  return kept.join(' ').trim();
}

function fallbackImpact(language: ReportLanguage): string {
  return language === 'fr'
    ? "Les constats de ce thème limitent directement l’utilisation des éléments concernés pour les visiteurs affectés."
    : 'The findings in this theme directly limit use of the affected interface elements for impacted visitors.';
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

  const executiveSummary =
    sanitizeSentences(raw.executiveSummary, 'executiveSummary', input.language, warnings) ||
    fallbackSummary(input.language);
  const notes = sanitizeSentences(raw.notes, 'notes', input.language, warnings);

  const themes = raw.themes.map((theme, themeIndex) => {
    const source = inputByKey.get(theme.themeKey);
    const impactField = `themes[${themeIndex}](${theme.themeKey}).businessImpact`;
    const businessImpact =
      sanitizeSentences(theme.businessImpact, impactField, input.language, warnings) ||
      fallbackImpact(input.language);

    const recommendedActions: string[] = [];
    for (const [actionIndex, action] of theme.recommendedActions.entries()) {
      const field = `themes[${themeIndex}](${theme.themeKey}).recommendedActions[${actionIndex}]`;
      let sanitized = sanitizeSentences(action, field, input.language, warnings);
      if (
        sanitized &&
        source?.category === 'performance' &&
        hasSuppressedMetric(
          sanitized,
          input.language,
          input.performanceEvidence.suppressedLabRecommendations,
        )
      ) {
        warning(warnings, 'performance-contradiction-removed', field);
        sanitized = '';
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
