import type { AuditManifest, EvidenceLimitation, Finding, ReportLanguage } from '@odysseus/core';
import { CORE_WEB_VITAL_THRESHOLDS, rateCoreWebVital } from '@odysseus/core';
import type {
  TrustedRemediationInput,
  WritingPerformanceEvidence,
  WritingPerformanceMetric,
  WritingPerformanceObservation,
} from '@odysseus/llm';
import { divergentLabLcp } from './core-web-vitals-table.js';
import { remediationFor } from '../remediation/index.js';

const INP_GOOD_MS = 200;
const INP_NEEDS_IMPROVEMENT_MS = 500;

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function labMedian(
  manifest: AuditManifest,
  metric: 'lcp' | 'cls' | 'tbt',
): number | null {
  const values = manifest.pages
    .map((page) => page.coreWebVitals?.[metric]?.numericValue)
    .filter((value): value is number => value !== null && value !== undefined);
  return median(values);
}

function threshold(metric: 'lcp' | 'cls' | 'tbt'): { good: number; needsImprovement: number } {
  const found = CORE_WEB_VITAL_THRESHOLDS.find((entry) => entry.key === metric);
  if (!found) throw new Error(`odysseus report: missing threshold for ${metric}`);
  return found;
}

const METRIC_PRIORITY: Record<WritingPerformanceMetric, number> = {
  cls: 0,
  inp: 1,
  lcp: 2,
  tbt: 3,
};

function concernOrder(a: WritingPerformanceObservation, b: WritingPerformanceObservation): number {
  const severity = { poor: 0, mid: 1, good: 2 } as const;
  return (
    severity[a.rating] - severity[b.rating] ||
    METRIC_PRIORITY[a.metric] - METRIC_PRIORITY[b.metric]
  );
}

/**
 * Plan 067 performance evidence contract. Field data is authoritative for
 * recommendation whenever it shows a weak Core Web Vital. Lab data remains
 * visible evidence, but a contradictory LCP outlier is explicitly suppressed
 * from generated recommendations using the same divergence rule the
 * deterministic Performance section renders.
 */
export function buildWritingPerformanceEvidence(
  manifest: AuditManifest,
  qualityLimitations: readonly EvidenceLimitation[] = [],
): WritingPerformanceEvidence {
  const observations: WritingPerformanceObservation[] = [];
  const labEvidenceLimited = qualityLimitations.some(
    (limitation) =>
      limitation.code === 'performance-confidence-insufficient' ||
      (limitation.code === 'unstable-material-result' &&
        limitation.evidenceRefs.some((ref) => ref.includes('performance:'))),
  );
  const field = manifest.cruxFieldData;
  if (field?.available) {
    if (field.lcp !== undefined) {
      const t = threshold('lcp');
      observations.push({
        metric: 'lcp',
        source: 'field',
        value: field.lcp.p75,
        rating: rateCoreWebVital(field.lcp.p75, t.good, t.needsImprovement),
      });
    }
    if (field.cls !== undefined) {
      const t = threshold('cls');
      observations.push({
        metric: 'cls',
        source: 'field',
        value: field.cls.p75,
        rating: rateCoreWebVital(field.cls.p75, t.good, t.needsImprovement),
      });
    }
    if (field.inp !== undefined) {
      observations.push({
        metric: 'inp',
        source: 'field',
        value: field.inp.p75,
        rating: rateCoreWebVital(field.inp.p75, INP_GOOD_MS, INP_NEEDS_IMPROVEMENT_MS),
      });
    }
  }

  if (!labEvidenceLimited) {
    for (const metric of ['lcp', 'cls', 'tbt'] as const) {
      const value = labMedian(manifest, metric);
      if (value === null) continue;
      const t = threshold(metric);
      observations.push({
        metric,
        source: 'lab',
        value,
        rating: rateCoreWebVital(value, t.good, t.needsImprovement),
      });
    }
  }

  const suppressed = new Set<WritingPerformanceMetric>();
  const fieldFor = (metric: WritingPerformanceMetric): WritingPerformanceObservation | undefined =>
    observations.find((entry) => entry.source === 'field' && entry.metric === metric);
  const labFor = (metric: WritingPerformanceMetric): WritingPerformanceObservation | undefined =>
    observations.find((entry) => entry.source === 'lab' && entry.metric === metric);

  for (const metric of ['lcp', 'cls'] as const) {
    const fieldMetric = fieldFor(metric);
    const labMetric = labFor(metric);
    if (fieldMetric?.rating === 'good' && labMetric !== undefined && labMetric.rating !== 'good') {
      suppressed.add(metric);
    }
  }
  if (fieldFor('inp')?.rating === 'good' && labFor('tbt')?.rating !== 'good') {
    suppressed.add('tbt');
  }
  // Keep the existing deterministic divergence rule as an explicit backstop
  // for the exact Villas Foch class even if the generic reconciliation above
  // changes later.
  if (divergentLabLcp(manifest) !== null) suppressed.add('lcp');

  const suppressedLabRecommendations = [...suppressed];
  const discordances = suppressedLabRecommendations.flatMap((metric) => {
    const fieldMetric = metric === 'tbt' ? fieldFor('inp') : fieldFor(metric);
    const labMetric = labFor(metric);
    if (fieldMetric === undefined || labMetric === undefined) return [];
    return [
      {
        field: fieldMetric,
        lab: labMetric,
        labNonRepresentativeForRecommendations: true as const,
      },
    ];
  });
  const weakField = observations
    .filter((entry) => entry.source === 'field' && entry.rating !== 'good')
    .sort(concernOrder);
  const weakLab = observations
    .filter(
      (entry) =>
        entry.source === 'lab' &&
        entry.rating !== 'good' &&
        !suppressed.has(entry.metric),
    )
    .sort(concernOrder);

  return {
    fieldDataAvailable: field?.available === true,
    observations,
    discordances,
    primaryConcern: weakField[0] ?? weakLab[0] ?? null,
    suppressedLabRecommendations,
  };
}

export interface ThemeFindingIds {
  themeKey: string;
  findingIds: readonly string[];
}

/**
 * Only reviewed remediation-registry strings are allowed into the writer's
 * trusted guidance packet. Unknown rules are omitted rather than synthesized.
 */
export function buildTrustedRemediationsByTheme(
  themes: readonly ThemeFindingIds[],
  findings: readonly Finding[],
  language: ReportLanguage,
): Readonly<Record<string, readonly TrustedRemediationInput[]>> {
  const byId = new Map(findings.map((finding) => [finding.findingId, finding]));
  const result: Record<string, TrustedRemediationInput[]> = {};

  for (const theme of themes) {
    const seen = new Set<string>();
    const entries: TrustedRemediationInput[] = [];
    for (const findingId of theme.findingIds) {
      const finding = byId.get(findingId);
      if (!finding || seen.has(finding.ruleId)) continue;
      seen.add(finding.ruleId);
      const guidance = remediationFor(finding.ruleId, language);
      if (guidance !== undefined) entries.push({ ruleId: finding.ruleId, guidance });
    }
    result[theme.themeKey] = entries;
  }
  return result;
}
