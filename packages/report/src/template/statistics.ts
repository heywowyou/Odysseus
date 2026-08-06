import type { AuditManifest, Finding } from '@odysseus/core';
import { buildConformanceRollup, pagesWithWcagFailures } from './conformance-rollup.js';

/** Deterministic counts for the statistics page (docs/report-v2-refactor.md
 *  B10): nowhere in v1 did the document state pages scanned, finding
 *  totals, or the severity breakdown before asking the reader to work
 *  through eleven themes. Verified against the real haaitza scan: 20
 *  pages, 103 findings (8/20/15/60 by severity), 431 accessibility
 *  occurrences, 23 accessibility findings, 16 SEO+rendering findings -
 *  every number here matches the doc's own verification table. */
export interface ReportStatistics {
  pagesScanned: number;
  totalFindings: number;
  accessibilityOccurrences: number;
  pagesWithCritical: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  wcagCriteriaFailingCount: number;
  pagesWithWcagFailure: number;
  accessibilityCount: number;
  seoRenderingCount: number;
}

export function computeStatistics(findings: readonly Finding[], manifest: AuditManifest): ReportStatistics {
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;

  let accessibilityOccurrences = 0;
  let critical = 0;
  let serious = 0;
  let moderate = 0;
  let minor = 0;
  let accessibilityCount = 0;
  let seoRenderingCount = 0;
  const pagesWithCriticalSet = new Set<string>();

  for (const finding of findings) {
    if (finding.category === 'accessibility') {
      accessibilityOccurrences += finding.occurrences;
      accessibilityCount += 1;
    }
    if (finding.category === 'seo' || finding.category === 'rendering') {
      seoRenderingCount += 1;
    }
    switch (finding.severity) {
      case 'critical':
        critical += 1;
        for (const url of finding.pageUrls) pagesWithCriticalSet.add(url);
        break;
      case 'serious':
        serious += 1;
        break;
      case 'moderate':
        moderate += 1;
        break;
      case 'minor':
        minor += 1;
        break;
    }
  }

  return {
    pagesScanned,
    totalFindings: findings.length,
    accessibilityOccurrences,
    pagesWithCritical: pagesWithCriticalSet.size,
    critical,
    serious,
    moderate,
    minor,
    wcagCriteriaFailingCount: buildConformanceRollup(findings).length,
    pagesWithWcagFailure: pagesWithWcagFailures(findings),
    accessibilityCount,
    seoRenderingCount,
  };
}
