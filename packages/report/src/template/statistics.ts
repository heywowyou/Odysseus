import type { AuditManifest, Finding } from '@odysseus/core';
import {
  contentCheckedPageUrls,
  HEURISTIC_RULE_IDS,
  RENDER_DIFF_EMISSION_THRESHOLD_PERCENT,
  summarizeAuditCoverage,
} from '@odysseus/core';
import { buildConformanceRollup, pagesWithWcagFailures } from './conformance-rollup.js';
import type { CATEGORY_ORDER } from './design-tokens.js';
import { EVIDENCE_INCLUSION_THRESHOLD_PERCENT } from '../constants.js';
import { isThirdPartyFinding } from './third-party-attribution.js';
import { reportPopulation, unlinkedSitemapPageUrls } from '@odysseus/core';

/** Deterministic counts for the statistics page (docs/archive/report-v2-refactor.md
 *  B10): nowhere in v1 did the document state pages scanned, finding
 *  totals, or the severity breakdown before asking the reader to work
 *  through eleven themes. Verified against the real haaitza scan: 20
 *  pages, 103 findings (8/20/15/60 by severity), 431 accessibility
 *  occurrences, 23 accessibility findings, 16 SEO+rendering findings -
 *  every number here matches the doc's own verification table. */
export interface ReportStatistics {
  pagesScanned: number;
  totalFindings: number;
  /** item 1.8 (La Corniche pass): excludes HEURISTIC_RULE_IDS findings
   *  (alt-text-quality-heuristic), same convention buildConformanceRollup
   *  and pagesWithWcagFailures already apply elsewhere - a heuristic red
   *  flag is not a confirmed conformance failure, so it must not inflate
   *  the one tile a client reads as a hard, deterministic count. A real
   *  report had 74 of 703 occurrences (10 percent) come from the
   *  heuristic alone, with no caveat next to three genuinely hard counts
   *  beside it. */
  accessibilityOccurrences: number;
  /** The heuristic-only occurrence count excluded from the figure above,
   *  kept separately so a future section can state it explicitly rather
   *  than silently dropping it. */
  accessibilityHeuristicOccurrences: number;
  /** P1.2 (2026-08-21 La Corniche feedback pass): how many of
   *  accessibilityOccurrences above come from findings tagged
   *  third-party (isThirdPartyFinding) - a real report had 37% of its
   *  accessibility occurrences trace to third-party components (Gravity
   *  Forms, Popup Maker, a booking widget), a fact that determines who
   *  the client actually needs to call, buried on page 21 of 27 with
   *  nothing in the résumé or the stats page pointing at it. Same
   *  heuristic-exclusion convention as accessibilityOccurrences: a
   *  heuristic finding's occurrences never enter this count either. */
  thirdPartyAccessibilityOccurrences: number;
  /** Findings whose captured evidence is entirely inside an embedded frame
   *  (Q1). They remain in the annex but do not affect the report's primary
   *  grade or counts. In-page vendor widgets are not included here. */
  confinedThirdPartyFindingCount: number;
  confinedThirdPartyOccurrenceCount: number;
  /** Plan 075, Q4: findings only on pages the sitemap alone reaches, when
   *  those pages are most of the analysed population. */
  unlinkedSitemapFindingCount: number;
  /** Findings of custom rules no real finding has confirmed yet, outside
   *  every count above (core's rule-confirmation.ts). */
  unconfirmedRuleFindingCount: number;
  unlinkedSitemapPageCount: number;
  pagesWithCritical: number;
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  wcagCriteriaFailingCount: number;
  pagesWithWcagFailure: number;
  accessibilityCount: number;
  seoRenderingCount: number;
  /** Per-category counts for doc §3 section 03's category-tile split
   *  (CATEGORY_ORDER order: accessibility/seo/rendering/performance, plus
   *  geo as of milestone 8.5c) - distinct from accessibilityCount/
   *  seoRenderingCount above, which predate that split and merge
   *  seo+rendering into one number. */
  categoryCounts: Record<(typeof CATEGORY_ORDER)[number], number>;
  /** item 39: "Rendu : 0" contradicted section 08's own reported gap
   *  (a real, non-zero render-diff percentage that simply sits below
   *  RENDER_DIFF_EMISSION_THRESHOLD_PERCENT, the point at which a
   *  render-diff finding is actually emitted). True only when the Rendu
   *  category tile is actually 0 (categoryCounts.rendering === 0) AND at
   *  least one page has a measured gap in that below-threshold band, so
   *  the template can add a one-line note explaining the "0" rather than
   *  let it read as a contradiction or a bug.
   *
   *  report-feedback-la-corniche.md item 0.5 [REGRESSION]: this used to
   *  check only the below-threshold-page condition, so it fired even when
   *  categoryCounts.rendering was genuinely non-zero (a page whose gap did
   *  cross the emission threshold, alongside a different page whose gap
   *  did not) - a real report showed "Rendu: 1" on the tile directly
   *  above a footnote insisting "la catégorie Rendu affiche 0 constat". */
  hasBelowThresholdRenderGap: boolean;
}

export function computeStatistics(
  findings: readonly Finding[],
  manifest: AuditManifest,
): ReportStatistics {
  const coverage = summarizeAuditCoverage(manifest);
  // Issue #291: page figures count distinct analysed (visited) pages only.
  const scopePageUrls = new Set(
    manifest.pages.filter((page) => page.status === 'visited').map((page) => page.url),
  );
  const pagesScanned =
    coverage.kind === 'current'
      ? coverage.content.completed + coverage.content.partial
      : manifest.pages.filter((page) => page.status === 'visited').length;
  // Issue #80: pagesWithCritical must never exceed pagesScanned on the same
  // stats row, so it is confined to the identical content-checked
  // population.
  const contentCheckedUrls = contentCheckedPageUrls(manifest);

  let accessibilityOccurrences = 0;
  let accessibilityHeuristicOccurrences = 0;
  let thirdPartyAccessibilityOccurrences = 0;
  const population = reportPopulation(manifest, findings);
  let critical = 0;
  let serious = 0;
  let moderate = 0;
  let minor = 0;
  let accessibilityCount = 0;
  let seoRenderingCount = 0;
  const pagesWithCriticalSet = new Set<string>();
  const categoryCounts: Record<(typeof CATEGORY_ORDER)[number], number> = {
    accessibility: 0,
    seo: 0,
    rendering: 0,
    performance: 0,
    geo: 0,
    privacy: 0,
  };

  for (const finding of population.primary) {
    if (finding.category === 'accessibility') {
      if (HEURISTIC_RULE_IDS.has(finding.ruleId)) {
        accessibilityHeuristicOccurrences += finding.occurrences;
      } else {
        accessibilityOccurrences += finding.occurrences;
        if (isThirdPartyFinding(finding)) {
          thirdPartyAccessibilityOccurrences += finding.occurrences;
        }
      }
      accessibilityCount += 1;
    }
    if (finding.category === 'seo' || finding.category === 'rendering') {
      seoRenderingCount += 1;
    }
    categoryCounts[finding.category] += 1;
    switch (finding.severity) {
      case 'critical':
        critical += 1;
        for (const url of finding.pageUrls) {
          if (contentCheckedUrls.has(url)) pagesWithCriticalSet.add(url);
        }
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
    totalFindings: population.primary.length,
    accessibilityOccurrences,
    accessibilityHeuristicOccurrences,
    thirdPartyAccessibilityOccurrences,
    confinedThirdPartyFindingCount: population.thirdPartyFrame.length,
    confinedThirdPartyOccurrenceCount: population.thirdPartyFrame.reduce(
      (sum, finding) => sum + finding.occurrences,
      0,
    ),
    unlinkedSitemapFindingCount: population.unlinkedSitemap.length,
    unconfirmedRuleFindingCount: population.unconfirmedRule.length,
    unlinkedSitemapPageCount: unlinkedSitemapPageUrls(manifest).size,
    pagesWithCritical: pagesWithCriticalSet.size,
    critical,
    serious,
    moderate,
    minor,
    wcagCriteriaFailingCount: buildConformanceRollup(findings, scopePageUrls).length,
    pagesWithWcagFailure: pagesWithWcagFailures(findings, scopePageUrls),
    accessibilityCount,
    seoRenderingCount,
    categoryCounts,
    hasBelowThresholdRenderGap:
      categoryCounts.rendering === 0 &&
      manifest.pages.some(
        (page) =>
          page.renderDiffMissingPercent !== undefined &&
          page.renderDiffMissingPercent >= EVIDENCE_INCLUSION_THRESHOLD_PERCENT &&
          page.renderDiffMissingPercent < RENDER_DIFF_EMISSION_THRESHOLD_PERCENT,
      ),
  };
}
