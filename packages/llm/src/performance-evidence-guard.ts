import type { ReportLanguage } from '@odysseus/core';
import type {
  WritingInput,
  WritingPassOutput,
  WritingPerformanceMetric,
} from './writing-schema.js';

export interface PerformanceEvidenceViolation {
  field: string;
  metric: WritingPerformanceMetric;
  text: string;
}

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

function suppressedMention(
  text: string,
  language: ReportLanguage,
  suppressed: readonly WritingPerformanceMetric[],
): WritingPerformanceMetric | undefined {
  return suppressed.find((metric) => METRIC_PATTERNS[language][metric].test(text));
}

/**
 * A lab metric explicitly suppressed by the reconciliation contract may not
 * reappear anywhere in generated priority prose. This is intentionally
 * stricter than "do not lead with it": the deterministic Performance section
 * already explains the discrepancy, so priority prose gains nothing by
 * relitigating the anomalous signal.
 */
export function findPerformanceEvidenceViolations(
  input: WritingInput,
  output: WritingPassOutput,
): PerformanceEvidenceViolation[] {
  const suppressed = input.performanceEvidence.suppressedLabRecommendations;
  if (suppressed.length === 0) return [];

  const violations: PerformanceEvidenceViolation[] = [];
  const summaryMetric = suppressedMention(output.executiveSummary, input.language, suppressed);
  if (summaryMetric !== undefined) {
    violations.push({
      field: 'executiveSummary',
      metric: summaryMetric,
      text: output.executiveSummary,
    });
  }

  const inputByKey = new Map(input.themes.map((theme) => [theme.themeKey, theme]));
  for (const [themeIndex, theme] of output.themes.entries()) {
    if (inputByKey.get(theme.themeKey)?.category !== 'performance') continue;
    const fields = [
      {
        field: `themes[${themeIndex}](${theme.themeKey}).title`,
        text: theme.title,
      },
      {
        field: `themes[${themeIndex}](${theme.themeKey}).businessImpact`,
        text: theme.businessImpact,
      },
      ...theme.recommendedActions.map((text, actionIndex) => ({
        field: `themes[${themeIndex}](${theme.themeKey}).recommendedActions[${actionIndex}]`,
        text,
      })),
    ];
    for (const field of fields) {
      const metric = suppressedMention(field.text, input.language, suppressed);
      if (metric !== undefined) violations.push({ ...field, metric });
    }
  }
  return violations;
}
