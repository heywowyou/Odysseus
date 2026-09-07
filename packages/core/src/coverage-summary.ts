import type {
  AuditManifest,
  AuditPass,
  AuditPassOutcome,
  ManifestPageEntry,
  ManifestPageStatus,
  PageAnalysisCoverage,
} from './types/manifest.js';

export interface AuditPassOutcomeCounts {
  completed: number;
  partial: number;
  failed: number;
  notPlanned: number;
}

export interface ContentCoverageCounts {
  completed: number;
  partial: number;
  failed: number;
}

export type PageWithoutContentAnalysisReason =
  Exclude<ManifestPageStatus, 'visited'> | 'coverage-missing';

interface AuditCoverageSummaryBase {
  inventoriedUrlCount: number;
  continuationOmittedUrlCount: number;
}

export interface LegacyAuditCoverageSummary extends AuditCoverageSummaryBase {
  kind: 'legacy-unknown';
}

export interface CurrentAuditCoverageSummary extends AuditCoverageSummaryBase {
  kind: 'current';
  content: ContentCoverageCounts;
  passes: Record<AuditPass, AuditPassOutcomeCounts>;
  pagesWithoutContentAnalysis: Partial<Record<PageWithoutContentAnalysisReason, number>>;
  templateFamilyCount: number;
}

export type AuditCoverageSummary = LegacyAuditCoverageSummary | CurrentAuditCoverageSummary;

const AUDIT_PASSES: readonly AuditPass[] = ['rendered', 'axe', 'extended', 'lighthouse'];

function emptyPassCounts(): AuditPassOutcomeCounts {
  return { completed: 0, partial: 0, failed: 0, notPlanned: 0 };
}

function incrementPassOutcome(counts: AuditPassOutcomeCounts, outcome: AuditPassOutcome): void {
  if (outcome === 'not-planned') {
    counts.notPlanned += 1;
    return;
  }
  counts[outcome] += 1;
}

export function contentOutcome(coverage: PageAnalysisCoverage): keyof ContentCoverageCounts {
  const outcomes = [
    coverage.passes.rendered.outcome,
    coverage.passes.axe.outcome,
    coverage.passes.extended.outcome,
  ];
  if (outcomes.every((outcome) => outcome === 'completed')) return 'completed';
  if (outcomes.some((outcome) => outcome === 'completed' || outcome === 'partial')) {
    return 'partial';
  }
  return 'failed';
}

function withoutContentReason(page: ManifestPageEntry): PageWithoutContentAnalysisReason {
  return page.status === 'visited' ? 'coverage-missing' : page.status;
}

/**
 * Derives the shared inventory and pass denominators from persisted facts.
 * Historical manifests remain an explicit unknown state: this function never
 * infers pass completion from `status === 'visited'` or from optional result
 * fields.
 */
export function summarizeAuditCoverage(
  manifest: Pick<AuditManifest, 'pages' | 'continuationGuardSummary'>,
): AuditCoverageSummary {
  const continuationOmittedUrlCount = manifest.continuationGuardSummary?.totalOmittedUrlCount ?? 0;
  const base = {
    inventoriedUrlCount: manifest.pages.length,
    continuationOmittedUrlCount,
  };
  const coveredPages = manifest.pages.filter(
    (page): page is ManifestPageEntry & { analysisCoverage: PageAnalysisCoverage } =>
      page.analysisCoverage !== undefined,
  );

  if (coveredPages.length === 0) {
    return { kind: 'legacy-unknown', ...base };
  }

  const content: ContentCoverageCounts = { completed: 0, partial: 0, failed: 0 };
  const passes: Record<AuditPass, AuditPassOutcomeCounts> = {
    rendered: emptyPassCounts(),
    axe: emptyPassCounts(),
    extended: emptyPassCounts(),
    lighthouse: emptyPassCounts(),
  };
  const pagesWithoutContentAnalysis: Partial<Record<PageWithoutContentAnalysisReason, number>> = {};
  const templateFamilies = new Set<string>();

  for (const page of coveredPages) {
    content[contentOutcome(page.analysisCoverage)] += 1;
    for (const pass of AUDIT_PASSES) {
      incrementPassOutcome(passes[pass], page.analysisCoverage.passes[pass].outcome);
    }
    templateFamilies.add(page.analysisCoverage.templateFamilyId ?? `unique:${page.url}`);
  }

  for (const page of manifest.pages) {
    if (page.analysisCoverage !== undefined) continue;
    const reason = withoutContentReason(page);
    pagesWithoutContentAnalysis[reason] = (pagesWithoutContentAnalysis[reason] ?? 0) + 1;
  }

  return {
    kind: 'current',
    ...base,
    content,
    passes,
    pagesWithoutContentAnalysis,
    templateFamilyCount: templateFamilies.size,
  };
}

/** Issue #80: the stats page showed "89 pages avec au moins un constat
 *  critique" beside "86 pages analysées" because pagesScanned counts the
 *  content-checked population (completed or partial, per contentOutcome)
 *  while the critical-pages count was built by unconditionally unioning
 *  every critical finding's own pageUrls, which can include a page outside
 *  that population (the same #41 pattern: a finding recorded against a
 *  discovered-but-not-scanned or otherwise uncovered page). This is the one
 *  place that computes that population's URL set, so pagesScanned and any
 *  numerator sharing its row scope to the exact same pages. */
export function contentCheckedPageUrls(
  manifest: Pick<AuditManifest, 'pages' | 'continuationGuardSummary'>,
): ReadonlySet<string> {
  const coverage = summarizeAuditCoverage(manifest);
  if (coverage.kind === 'legacy-unknown') {
    return new Set(
      manifest.pages.filter((page) => page.status === 'visited').map((page) => page.url),
    );
  }
  return new Set(
    manifest.pages
      .filter(
        (page): page is ManifestPageEntry & { analysisCoverage: PageAnalysisCoverage } =>
          page.analysisCoverage !== undefined && contentOutcome(page.analysisCoverage) !== 'failed',
      )
      .map((page) => page.url),
  );
}
