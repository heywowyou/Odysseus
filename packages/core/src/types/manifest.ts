/**
 * Audit manifest, written to both manifest.json on disk and the `audits`
 * MongoDB collection. This is what makes `normalize <dir>` work fully
 * offline: everything needed to re-run normalization lives in the
 * manifest plus the per-page scan.json files, no database required.
 *
 * Not a locked contract (unlike findings.ts/severity.ts/llm-output.ts),
 * but changes here still ripple into packages/scanner and packages/store,
 * so treat it as stable once milestones 5/6 start depending on it.
 */

import type { FINDINGS_SCHEMA_VERSION } from './findings.js';
import type { SiteSignals } from './compliance.js';
import type { TranslationCluster } from '../normalize/translation-clusters.js';
import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import type { SiteBenchmarkPercentile } from '../benchmark/percentile.js';

export type ManifestKind = 'audit' | 'render-diff';

export type SitemapMode = 'none' | 'inspect' | 'supplement';

export type PageDiscoveryMethod = 'link' | 'seed' | 'sitemap-only';

export interface SitemapCoverageSummary {
  declaredPageCount: number;
  eligiblePageCount: number;
  /** @deprecated Legacy crawl-era name. This remains the historical count
   *  of sitemap-eligible pages whose crawl status was `visited`; use
   *  `PageAnalysisCoverage` for current pass-specific work. */
  scannedPageCount: number;
  filteredPageCount: number;
  capOmittedPageCount: number;
  failedSitemapCount: number;
}

export type AuditPageRole = 'content' | 'transactional' | 'listing' | 'utility' | 'unknown';

export type AuditPass = 'rendered' | 'axe' | 'extended' | 'lighthouse';

export type AuditPassOutcome = 'completed' | 'partial' | 'failed' | 'not-planned';

export interface AuditPassCoverage {
  outcome: AuditPassOutcome;
  /** Stable identifiers from the scanner check-scope registry. Raw error
   *  text remains in the existing page `errors` fields. */
  failedCheckIds?: string[];
}

export interface PageAnalysisCoverage {
  plannerVersion: 'v1';
  role: AuditPageRole;
  confidence: 'high' | 'fallback';
  templateFamilyId?: string;
  reasonCodes: string[];
  passes: Record<AuditPass, AuditPassCoverage>;
}

export type ContinuationBasis = 'rel-next' | 'numbered-pagination-control' | 'query-key-family';

export interface ContinuationFamilyOmission {
  familyKey: string;
  basis: ContinuationBasis;
  enqueuedCount: number;
  omittedCount: number;
  /** At most three deterministic examples, sorted by URL. */
  omittedExampleUrls: string[];
}

export interface ContinuationGuardSummary {
  guardVersion: 'v1';
  familyMaxEnqueued: number;
  /** At most 100 families, sorted by familyKey. */
  families: ContinuationFamilyOmission[];
  additionalFamiliesOmittedCount: number;
  /** Includes omissions from families beyond the bounded detail list. */
  totalOmittedUrlCount: number;
}

export interface ToolVersions {
  odysseusVersion: string;
  findingsSchemaVersion: typeof FINDINGS_SCHEMA_VERSION;
  /** null when every page's axe pass failed, so there is no successful
   *  result to read testEngine.version from. */
  axeCoreVersion: string | null;
  /** null when every page's Lighthouse pass failed. */
  lighthouseVersion: string | null;
  playwrightVersion: string;
  chromiumVersion: string;
}

export interface AuditConfigSnapshot {
  maxPages: number;
  maxDepth: number;
  crawlDelayMs: number;
  pageTimeoutMs: number;
  lighthouseTimeoutMs: number;
  /** Upper bound on the rendered pass's post-`load` wait for network
   *  idle. Recorded for the same provenance reason as the other scan
   *  config fields: it bounds how settled a page was when render-diff
   *  measured it, so a missingPercent shift between two runs can be told
   *  apart from a real site change. Optional because audits stored
   *  before 2026-08-24 predate the setting. */
  renderSettleTimeoutMs?: number;
  userAgent: string;
  /** Number of pages the scan phase processed at once. Each lane keeps
   *  crawlDelayMs pacing independently; this does not change politeness
   *  per request, only how many page-lanes run concurrently. */
  scanConcurrency: number;
  /** Optional for compatibility with audits captured before milestone
   *  9b.5. Full audits use `supplement`; prospecting uses `inspect`. */
  sitemapMode?: SitemapMode;
}

/**
 * Deliberately duplicates scanner's CrawledPageStatus union by value, not
 * by import: packages/core must not depend on packages/scanner. Keep the
 * two in sync by hand.
 */
export type ManifestPageStatus =
  | 'visited'
  /** Fetched for link discovery only, deliberately not scanned, so it
   *  produces no findings. Currently only a bare language homepage
   *  (`/en`, `/es`), which duplicates the homepage it translates but can
   *  be the sole link into that language's subtree. See links.ts's
   *  isLanguageHomepagePath. */
  | 'discovered-not-scanned'
  | 'skipped-robots'
  | 'skipped-non-html'
  | 'skipped-external-redirect'
  /** Navigated, but the server answered a non-2xx final status (issue
   *  #39). The URL stays inventoried with its failure reason (httpStatus),
   *  but no page directory was written, no scanner ran on it, and it does
   *  not belong to the content-checked population. Historical manifests
   *  recorded these as 'visited'; keep the broken-internal-link rule
   *  reading both shapes. */
  | 'http-error-status'
  /** A 200 response whose page is a client-side redirect interstitial
   *  (issue #85): the browser navigated away from the requested URL by
   *  the time render-diff's settle wait completed, so the rendered
   *  content actually belongs to another URL, not this one. Detected
   *  post-hoc in write-audit.ts, after the page has already been
   *  scanned - unlike every other non-'visited' status here, which is
   *  decided before scanning starts. The URL stays inventoried; no
   *  analysisCoverage is ever set for it, which is what excludes it from
   *  the content-checked population and the report's analysed-page list
   *  with no extra logic in either place. */
  | 'redirect-interstitial'
  | 'error';

/**
 * Lighthouse's accessibility and best-practices categories are excluded
 * from finding emission this milestone (see CLAUDE.md), but their scores
 * are still worth keeping so the numbers aren't lost.
 */
export interface LighthouseExcludedCategoryScores {
  accessibility: number | null;
  bestPractices: number | null;
}

/** A single Lighthouse metric audit's score plus the raw measurement
 *  behind it. Score is a normalized ranking; numericValue/displayValue
 *  are the actual measurement a report needs to show ("your homepage
 *  takes 4.2 seconds"), per docs/rules/normalization-rules.md section 4. */
export interface CoreWebVitalMeasurement {
  score: number | null;
  numericValue: number | null;
  displayValue: string | null;
}

/** LCP and CLS, TBT as the lab-available proxy for responsiveness, plus
 *  FCP and Speed Index (added for the report's aggregated performance
 *  section, docs/report/report-design-system.md section 3: 5 medians, not 3).
 *  Both are read from Lighthouse audits ('first-contentful-paint',
 *  'speed-index') already present in every navigation-mode LHR, the same
 *  way lcp/cls/tbt are - no new scan-time work. INP is still deliberately
 *  not included: Lighthouse in navigation mode (the only mode this
 *  scanner runs) never produces an INP audit at all, because INP requires
 *  an actual user interaction during the trace and the scanner only loads
 *  the page. Decided during Milestone 6 planning; do not add an inp field
 *  populated with null, and do not label tbt as INP. */
export interface CoreWebVitals {
  lcp: CoreWebVitalMeasurement;
  cls: CoreWebVitalMeasurement;
  tbt: CoreWebVitalMeasurement;
  fcp: CoreWebVitalMeasurement;
  speedIndex: CoreWebVitalMeasurement;
}

/** A single CrUX (Chrome UX Report) metric's real-user p75 value, in the
 *  API's own native unit (ms for LCP/INP, unitless for CLS). */
export interface CruxMetricResult {
  p75: number;
}

/** Milestone 8.6: Chrome UX Report field data for the audited origin -
 *  real Chrome users, not Lighthouse's lab simulation. Origin-level, not
 *  per-page (CrUX's own granularity), fetched once per audit, hence a
 *  top-level AuditManifest field rather than something on
 *  ManifestPageEntry. `available: false` means CrUX has no public record
 *  for this origin (most audited sites, given CrUX's own minimum-traffic
 *  threshold) - this is the expected, common case, not an error, and
 *  report generation must render it as "insufficient real-user traffic
 *  for public data available", never silently omit the section or imply
 *  a pass. Recorded here rather than invented as a Finding for the same
 *  reason lighthouseExcludedCategoryScores lives in the manifest and not
 *  in findings.json: it is a fact worth keeping regardless of whether it
 *  crosses any severity threshold. Poor field-data values (per Google's
 *  published Core Web Vitals thresholds) still produce real findings -
 *  see normalize-crux.ts - this field is the underlying data those
 *  findings are derived from, kept independently so a healthy site's
 *  numbers are not lost the same way coreWebVitals' own doc comment
 *  explains. */
export interface CruxFieldDataResult {
  available: boolean;
  lcp?: CruxMetricResult;
  cls?: CruxMetricResult;
  inp?: CruxMetricResult;
  fetchError?: string;
}

export interface ManifestPageEntry {
  url: string;
  /** Path relative to the audit directory, e.g. "pages/contact-d4e5f6".
   *  Absent for pages the crawler never scanned at all (status
   *  'skipped-robots' or crawl-phase 'error'), since nothing was written
   *  to disk for them. */
  pageDir?: string;
  depth: number;
  status: ManifestPageStatus;
  /** Optional because historical manifests predate discovery provenance. */
  discoveryMethod?: PageDiscoveryMethod;
  httpStatus?: number;
  /** Recorded for every page regardless of whether a render-diff finding
   *  was emitted, so a healthy site's numbers aren't lost. */
  renderDiffMissingPercent?: number;
  lighthouseExcludedCategoryScores?: LighthouseExcludedCategoryScores;
  /** Recorded for every page with a successful Lighthouse pass,
   *  regardless of score, so a page with good vitals isn't lost the way
   *  it is in findings.json (which only carries these numbers for pages
   *  that failed Lighthouse's emission threshold). Absent for audits
   *  captured before Milestone 6 and for pages whose Lighthouse pass
   *  failed entirely; report generation must render an explicit "not
   *  measured" state rather than assume this field exists. */
  coreWebVitals?: CoreWebVitals;
  /** Populated for status 'error': the crawl-phase failure (e.g. a
   *  navigation timeout) that meant this page was never scanned at all.
   *  Distinct from `errors` below, which covers per-scanner failures on a
   *  page that was otherwise successfully visited and scanned. */
  crawlError?: string;
  /** The one page that first linked to this URL during the crawl, if
   *  any (absent for the start URL itself). Milestone 8's
   *  broken-internal-link check reads this to attribute a broken target
   *  back to the page that links to it - kept in the manifest, not just
   *  the in-memory crawl result, so `normalize <dir>` can re-derive that
   *  finding offline from stored artifacts alone. */
  discoveredFrom?: string;
  /** Populated only for status 'redirect-interstitial': the URL the
   *  browser actually landed on. Traceability only, not required for any
   *  coverage or dedupe logic. */
  redirectTargetUrl?: string;
  /** Plan 021. Optional for historical manifests; absence on a current
   *  inventory-only page means no content analysis was planned because the
   *  page was not successfully crawled HTML. */
  analysisCoverage?: PageAnalysisCoverage;
  errors: {
    renderDiff?: string;
    axe?: string;
    lighthouse?: string;
  };
}

/** Site-level facts the obligation engine (compliance/assessObligations.ts)
 *  needs, gathered once across the whole crawl rather than per page.
 *  Optional on AuditManifest, same precedent as coreWebVitals: absent for
 *  audits captured before this milestone, and report/pipeline code must
 *  treat absence as "not measured", not assume presence. */
export interface AuditManifestSiteSignals extends SiteSignals {
  /** The checksum-validated SIREN found on the mentions-legales page, if
   *  any. Absent (not empty string) when no mentions-legales page was
   *  identified or no valid SIREN was found on it. */
  siren?: string;
  mentionsLegalesPageUrl?: string;
  /** 2026-08-22, La Corniche report review: the commercial/brand name a
   *  site calls itself, read from the homepage's own head metadata
   *  (`og:site_name`, falling back to the `<title>` tag up to its first
   *  "|" or em dash separator) - not from Sirene, which frequently has no
   *  brand name on file at all (confirmed against the live Sirene API for
   *  a real client: `siege.nom_commercial`, `enseigne_1/2/3` and
   *  `liste_enseignes` were all null for a site whose own `og:site_name`
   *  was exactly right). Feeds `AuditManualFields.nomCommercial` as a
   *  fill-if-absent prefill (packages/store/src/audits.ts's
   *  `prefillAuditManualFields`), never overwriting an operator-entered
   *  value. Absent when the homepage was not visited or carried neither
   *  signal. */
  siteName?: string;
}

/** The two privacy/security checks are site-level checks attached to the
 * homepage scan result. Their absence in an older manifest, or after a
 * failed homepage scan, is deliberately distinct from a completed clean
 * result: report copy must never describe unavailable evidence as a pass. */
export interface PrivacySecurityCoverage {
  securityHeaders: 'completed' | 'unavailable';
  cookieConsent: 'completed' | 'unavailable';
}

/** Plan 041 slice B2: which record authorized a candidate-linked outreach
 *  full scan. `cohort` is the selection rule's own record; `wave-roster` is
 *  the operator's own additive list, used only when the rule's cohorts do
 *  not authorize the candidate. */
export type OutreachAuthorizationSource = 'cohort' | 'wave-roster';

/** Plan 037: prospecting provenance stamped on one candidate-linked
 *  outreach full scan. Presence marks the audit as selected-prospect
 *  evidence, decided when the job was created and re-validated when the
 *  worker claimed it; it is never inferred from a hostname after the fact.
 *  Absent on every ordinary paid or CLI audit. Immutable after insert:
 *  a later scan of the same site is a new audit with its own context. */
export interface AuditOutreachContext {
  candidateId: string;
  cohortId: string;
  scoringVersion: string;
  authorizedBy: OutreachAuthorizationSource;
}

export interface AuditManifest {
  auditId: string;
  kind: ManifestKind;
  siteUrl: string;
  /** ISO 8601. manifest.json is disk JSON, so no native Date here. */
  startedAt: string;
  finishedAt: string;
  /** Stamped only by the `normalize` command when it re-runs
   *  normalization offline against stored scan.json files. */
  renormalizedAt?: string;
  /** Provenance of the exact findings.json derived from this manifest.
   *  Optional only for historical manifests; analysis and report generation
   *  fail closed until `normalize` stamps legacy artifacts. */
  findingsProvenance?: FindingsProvenance;
  tool: ToolVersions;
  config: AuditConfigSnapshot;
  crawl: {
    startUrl: string;
    visitedCount: number;
    maxPages: number;
    maxDepth: number;
    robotsTxtFound: boolean;
    effectiveDelayMs: number;
    /** Milestone 8.5a. Optional so manifests from before this milestone
     *  still parse; `normalize <dir>` treats an absent value as "no
     *  disallow-breadth data available", not as zero matches. */
    robotsDisallowMatches?: { pattern: string; matchedPageCount: number }[];
    /** Milestone 8.6. Optional so manifests from before this milestone
     *  still parse; only blocked agents are listed, since an allowed
     *  agent has nothing for normalize-crawl.ts's ai-crawler-blocked
     *  check to report. */
    aiCrawlerBlocks?: { agent: string; disallowPattern: string }[];
    /** Milestone 9b.5. Absent when sitemap inspection was disabled or on
     *  historical manifests captured before sitemap coverage was tracked. */
    sitemapCoverage?: SitemapCoverageSummary;
  };
  pages: ManifestPageEntry[];
  /** Plan 021. Bounded crawl-frontier omissions, stored separately from
   *  inventoried pages so an omitted URL is never presented as visited. */
  continuationGuardSummary?: ContinuationGuardSummary;
  siteSignals?: AuditManifestSiteSignals;
  /** Additive scanner provenance for the privacy/security report scope.
   * Absent on historical audits and therefore rendered as unavailable. */
  privacySecurityCoverage?: PrivacySecurityCoverage;
  /** Milestone 8.6. Optional so manifests from before this milestone,
   *  and audits where CRUX_API_KEY was not configured, still parse -
   *  absence here means "not queried at all" (no API key configured),
   *  distinct from `available: false` inside the object itself, which
   *  means "queried, but CrUX has no public record for this origin".
   *  Both must render the same way in a report (no real-user data
   *  shown); the distinction only matters for our own debugging. */
  cruxFieldData?: CruxFieldDataResult;
  /** B2 (2026-08-24). Language-variant groups derived from the pages'
   *  own hreflang declarations at scan time, so `normalize <dir>` can
   *  re-run offline against a stored artifacts folder and reach the same
   *  grouping without re-reading every page's head metadata. Optional:
   *  absent on manifests predating this field, and empty on a site that
   *  declares no alternates - both mean "no page is a translation of any
   *  other", which is the correct answer for a monolingual site and the
   *  behaviour that shipped before this existed. */
  translationClusters?: TranslationCluster[];
  /** Milestone 10. Absent on every audit until the benchmark cohort's
   *  frozen scores exist (slice 3) and a report-generation step computes
   *  this site's standing against them - absence means "not compared",
   *  never "compared and found nothing", so the report section renders
   *  nothing rather than a false zero. */
  benchmarkPercentile?: SiteBenchmarkPercentile;
  /** Plan 037. Present only on candidate-linked outreach full scans; see
   *  AuditOutreachContext. */
  outreach?: AuditOutreachContext;
}
