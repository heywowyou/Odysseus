import {
  summarizeAuditCoverage,
  type AuditManifest,
  type PageWithoutContentAnalysisReason,
  type ReportLanguage,
} from '@odysseus/core';
import { fillTemplate, formatNumber, pluralize } from './html-utils.js';
import type { ReportStrings } from './strings/i18n.js';

const WITHOUT_CONTENT_REASON_ORDER: readonly PageWithoutContentAnalysisReason[] = [
  'discovered-not-scanned',
  'skipped-robots',
  'skipped-non-html',
  'skipped-external-redirect',
  'error',
  'http-error-status',
  'redirect-interstitial',
  'soft-error-page',
  'coverage-missing',
];

export interface CoverageDisclosure {
  /** The full pass-by-pass breakdown. Issue #324: printed only in the
   *  methodology section - it used to open four other sections verbatim. */
  summary: string;
  /** Issue #324: the one plain scope line for the metadata sheet ("140
   *  pages analysées sur 217 adresses trouvées"), with none of the pass
   *  vocabulary. */
  plainSummary: string;
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
  const cov = strings.coverage;
  const n = (value: number): string => formatNumber(value, language);
  // Composes a full "N word(s)" phrase (issue #28: a bare count next to a
  // hardcoded plural noun/adjective disagreed with the count whenever it
  // was 1, in both languages - French adjectives also needed the matching
  // gendered singular, not just the English noun's dropped "s").
  const phrase = (count: number, singular: string, plural: string): string =>
    `${n(count)} ${pluralize(language, count, singular, plural)}`;

  if (coverage.kind === 'legacy-unknown') {
    const inventory = phrase(
      coverage.inventoriedUrlCount,
      cov.inventoriedUrlSingular,
      cov.inventoriedUrlPlural,
    );
    return {
      summary: fillTemplate(strings.coverage.legacyUnknownTemplate, { inventory }),
      plainSummary: inventory,
      details: [],
    };
  }

  const contentCompleted = coverage.content.completed + coverage.content.partial;
  const lighthouseMeasured =
    coverage.passes.lighthouse.completed + coverage.passes.lighthouse.partial;
  const details: string[] = [];
  const withoutContent = WITHOUT_CONTENT_REASON_ORDER.flatMap((reason) => {
    const count = coverage.pagesWithoutContentAnalysis[reason] ?? 0;
    const label = strings.coverage.reasonLabels[reason];
    return count === 0 ? [] : [phrase(count, label.singular, label.plural)];
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
    plainSummary: fillTemplate(strings.coverage.plainSummaryTemplate, {
      analysed: phrase(contentCompleted, cov.analysedPageSingular, cov.analysedPagePlural),
      found: phrase(coverage.inventoriedUrlCount, cov.foundAddressSingular, cov.foundAddressPlural),
    }),
    summary: fillTemplate(strings.coverage.summaryTemplate, {
      inventory: phrase(
        coverage.inventoriedUrlCount,
        cov.inventoriedUrlSingular,
        cov.inventoriedUrlPlural,
      ),
      content: phrase(contentCompleted, cov.pageSingular, cov.pagePlural),
      contentCompleted: phrase(
        coverage.content.completed,
        cov.completedSingular,
        cov.completedPlural,
      ),
      contentPartial: phrase(coverage.content.partial, cov.partialSingular, cov.partialPlural),
      // The parenthetical breaks down the content total, which counts
      // completed plus partial pages only. Listing the failures inside it
      // made the breakdown sum past the total it was breaking down.
      contentFailed: phrase(coverage.content.failed, cov.pageSingular, cov.pagePlural),
      lighthouse: phrase(lighthouseMeasured, cov.measuredSingular, cov.measuredPlural),
      lighthousePartial: phrase(
        coverage.passes.lighthouse.partial,
        cov.lighthousePartialSingular,
        cov.lighthousePartialPlural,
      ),
      lighthouseFailed: n(coverage.passes.lighthouse.failed),
      lighthouseNotPlanned: phrase(
        coverage.passes.lighthouse.notPlanned,
        cov.notPlannedSingular,
        cov.notPlannedPlural,
      ),
    }),
    details,
  };
}
