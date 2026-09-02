import {
  summarizeAuditCoverage,
  type AuditManifest,
  type PageWithoutContentAnalysisReason,
  type ReportLanguage,
} from '@odysseus/core';
import { fillTemplate, formatNumber } from './html-utils.js';
import type { ReportStrings } from './strings/i18n.js';

const WITHOUT_CONTENT_REASON_ORDER: readonly PageWithoutContentAnalysisReason[] = [
  'discovered-not-scanned',
  'skipped-robots',
  'skipped-non-html',
  'skipped-external-redirect',
  'error',
  'coverage-missing',
];

export interface CoverageDisclosure {
  summary: string;
  details: readonly string[];
}

/**
 * Turns the shared persisted coverage facts into bilingual report copy.
 * Report sections choose the compact summary or append the detailed lines;
 * none of them re-derive pass denominators from visited URLs.
 */
export function buildCoverageDisclosure(
  strings: ReportStrings,
  manifest: AuditManifest,
  language: ReportLanguage,
): CoverageDisclosure {
  const coverage = summarizeAuditCoverage(manifest);
  const n = (value: number): string => formatNumber(value, language);

  if (coverage.kind === 'legacy-unknown') {
    return {
      summary: fillTemplate(strings.coverage.legacyUnknownTemplate, {
        inventory: n(coverage.inventoriedUrlCount),
      }),
      details: [],
    };
  }

  const contentCompleted = coverage.content.completed + coverage.content.partial;
  const lighthouseMeasured =
    coverage.passes.lighthouse.completed + coverage.passes.lighthouse.partial;
  const details: string[] = [];
  const withoutContent = WITHOUT_CONTENT_REASON_ORDER.flatMap((reason) => {
    const count = coverage.pagesWithoutContentAnalysis[reason] ?? 0;
    return count === 0 ? [] : [`${n(count)} ${strings.coverage.reasonLabels[reason]}`];
  });
  if (withoutContent.length > 0) {
    details.push(
      fillTemplate(strings.coverage.withoutContentTemplate, {
        reasons: withoutContent.join(', '),
      }),
    );
  }
  if (coverage.continuationOmittedUrlCount > 0) {
    details.push(
      fillTemplate(strings.coverage.guardedOmissionsTemplate, {
        count: n(coverage.continuationOmittedUrlCount),
      }),
    );
  }

  return {
    summary: fillTemplate(strings.coverage.summaryTemplate, {
      inventory: n(coverage.inventoriedUrlCount),
      content: n(contentCompleted),
      contentCompleted: n(coverage.content.completed),
      contentPartial: n(coverage.content.partial),
      contentFailed: n(coverage.content.failed),
      lighthouse: n(lighthouseMeasured),
      lighthousePartial: n(coverage.passes.lighthouse.partial),
      lighthouseFailed: n(coverage.passes.lighthouse.failed),
      lighthouseNotPlanned: n(coverage.passes.lighthouse.notPlanned),
    }),
    details,
  };
}
