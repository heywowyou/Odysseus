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

import type { FINDINGS_SCHEMA_VERSION, RawDocumentSignals } from './findings.js';
import type { SiteSignals } from './compliance.js';
import type { TranslationCluster } from '../normalize/translation-clusters.js';
import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import type { SiteBenchmarkPercentile } from '../benchmark/percentile.js';
import type { CoreWebVitalMetricKey } from '../normalize/cwv-thresholds.js';
import { LEGAL_PATH_PATTERN } from '../urls.js';

export type ManifestKind = 'audit' | 'render-diff';

/** Why a single-site operator scan was run. This is persisted audit
 * provenance, not display copy: qualification and workflow automation must
 * use this value rather than infer intent from a route or job label. */
export type ScanIntent = 'quick-check' | 'prospecting-audit' | 'full-audit';

export type SitemapMode = 'none' | 'inspect' | 'supplement';

/** Site-wide absence claims are only safe when the pages that could carry
 * the missing item were actually available. These are the rule IDs that can
 * therefore be downgraded to an explicit manual check when acquisition left
 * a candidate page blocked or failed. */
export const COVERAGE_LIMITATION_RULE_IDS = [
  'accessibility-statement-missing',
  'lcen-mentions-legales-missing',
  'consent-mechanism-absent',
  'hreflang-missing',
  'structured-data-entity-missing',
  'sitemap-orphan-page',
  'llms-txt-missing',
] as const;

export type CoverageLimitationRuleId = (typeof COVERAGE_LIMITATION_RULE_IDS)[number];

export interface CoverageLimitation {
  ruleId: CoverageLimitationRuleId;
  blockedCandidateCount: number;
  failedCandidateCount: number;
  /** Pages the crawl left out because of a page cap. Any of them could have
   *  carried the missing item, so a capped crawl cannot claim absence. */
  capOmittedPageCount?: number;
  /** At most the first 20 URLs, for an operator's manual follow-up. */
  candidateUrls?: string[];
}

/** Which inventoried pages could have carried the item an absence rule says
 * is missing. A page-scoped rule (a statement, a legal notice, a consent
 * banner) only loses its certainty when a page of that kind, or the homepage
 * that links to it, was not seen. A site-graph rule loses it when any page of
 * the graph was not seen. `llms-txt-missing` is a single file fetch and never
 * depends on page coverage. */
const ACCESSIBILITY_CANDIDATE_PATTERN =
  /(accessibilit|handicap|rgaa|declaration-d?-?accessibilite)/i;

type CandidateScope = 'page-pattern' | 'site-graph' | 'none';

const CANDIDATE_SCOPE_BY_RULE: Readonly<
  Record<CoverageLimitationRuleId, { scope: CandidateScope; pattern?: RegExp }>
> = {
  'accessibility-statement-missing': {
    scope: 'page-pattern',
    pattern: ACCESSIBILITY_CANDIDATE_PATTERN,
  },
  'lcen-mentions-legales-missing': { scope: 'page-pattern', pattern: LEGAL_PATH_PATTERN },
  'consent-mechanism-absent': { scope: 'page-pattern', pattern: LEGAL_PATH_PATTERN },
  'hreflang-missing': { scope: 'site-graph' },
  'structured-data-entity-missing': { scope: 'site-graph' },
  'sitemap-orphan-page': { scope: 'site-graph' },
  'llms-txt-missing': { scope: 'none' },
};

/** A page the crawl could not read. A redirect (its target is followed), a
 * real 404, a soft-error template, an off-site redirect, and a deliberately
 * discovery-only page are facts about the site, not gaps in what was seen.
 * A transient server answer (429 or 5xx) is a gap. */
function coverageGapKind(
  page: Pick<ManifestPageEntry, 'status' | 'httpStatus'>,
): 'blocked' | 'failed' | undefined {
  if (page.status === 'blocked' || page.status === 'skipped-robots') return 'blocked';
  if (page.status === 'error') return 'failed';
  if (
    page.status === 'http-error-status' &&
    page.httpStatus !== undefined &&
    (page.httpStatus === 429 || page.httpStatus >= 500)
  ) {
    return 'failed';
  }
  return undefined;
}

/** Derives the conservative limitation ledger from the crawl inventory.
 * Core does not decide whether a page was blocked: the scanner already
 * recorded that status. It only makes the absence-rule consequence explicit
 * and deterministic. Pure over the page list, so consumers re-derive it
 * rather than trust a copy persisted by an older derivation. */
export function deriveCoverageLimitations(
  pages: readonly (Pick<ManifestPageEntry, 'url' | 'status' | 'httpStatus'> & { depth?: number })[],
  options: { homepageUrl?: string; capOmittedPageCount?: number } = {},
): CoverageLimitation[] {
  const gaps = pages.flatMap((page) => {
    const kind = coverageGapKind(page);
    return kind === undefined ? [] : [{ page, kind }];
  });
  const capOmitted = options.capOmittedPageCount ?? 0;
  if (capOmitted > 0) {
    // Any page left out by a cap could have carried the item, so every
    // absence rule that searches pages becomes a manual check.
    return COVERAGE_LIMITATION_RULE_IDS.filter(
      (ruleId) => CANDIDATE_SCOPE_BY_RULE[ruleId].scope !== 'none',
    ).map((ruleId) => ({
      ruleId,
      blockedCandidateCount: gaps.filter(({ kind }) => kind === 'blocked').length,
      failedCandidateCount: gaps.filter(({ kind }) => kind === 'failed').length,
      capOmittedPageCount: capOmitted,
    }));
  }
  if (gaps.length === 0) return [];

  const isHomepage = (page: { url: string; depth?: number }): boolean =>
    page.depth === 0 || (options.homepageUrl !== undefined && page.url === options.homepageUrl);

  const limitations: CoverageLimitation[] = [];
  for (const ruleId of COVERAGE_LIMITATION_RULE_IDS) {
    const { scope, pattern } = CANDIDATE_SCOPE_BY_RULE[ruleId];
    if (scope === 'none') continue;
    const candidates = gaps.filter(
      ({ page }) =>
        scope === 'site-graph' || isHomepage(page) || (pattern?.test(page.url) ?? false),
    );
    if (candidates.length === 0) continue;
    const candidateUrls = [...new Set(candidates.map(({ page }) => page.url))].slice(0, 20);
    limitations.push({
      ruleId,
      blockedCandidateCount: candidates.filter(({ kind }) => kind === 'blocked').length,
      failedCandidateCount: candidates.filter(({ kind }) => kind === 'failed').length,
      candidateUrls,
    });
  }
  return limitations;
}

export type PageDiscoveryMethod = 'link' | 'seed' | 'sitemap-only';

export interface SitemapCoverageSummary {
  declaredPageCount: number;
  eligiblePageCount: number;
  /** @deprecated Legacy crawl-era name. This remains the historical count
   *  of sitemap-eligible pages whose crawl status was `visited`; use
   *  `PageAnalysisCoverage` for current pass-specific work. */
  scannedPageCount: number;
  /** Sitemap-eligible URLs the crawl reached and settled without scanning:
   *  a definite 404 or 410 (a stale sitemap entry, a fact about the site)
   *  or a page the crawl chose not to scan. The coverage gate leaves them
   *  out of its denominator. Absent on audits crawled before it existed. */
  settledUnscannedPageCount?: number;
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
  /** Plan 075 K1: checks that ran on the page without concluding (a Tab walk
   *  an open dialog held, a video whose audio could not be read). Their
   *  clean result says nothing about the page. */
  inconclusiveCheckIds?: string[];
}

export type SurfaceSampleReason =
  'homepage' | 'mandatory' | 'family-representative' | 'unique-family' | 'family-sampled';

export interface PageSurfaceSampleCoverage {
  selected: boolean;
  reason: SurfaceSampleReason;
}

export interface PageAnalysisCoverage {
  /** v1/v2 audits stay readable; v3 includes family surface sampling. */
  plannerVersion: 'v1' | 'v2' | 'v3';
  role: AuditPageRole;
  confidence: 'high' | 'fallback';
  templateFamilyId?: string;
  reasonCodes: string[];
  /** Absent on older audits that predate mobile/consent family sampling. */
  surfaceSample?: PageSurfaceSampleCoverage;
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
  /** The host pushed back or served a bot challenge. The URL remains
   * inventoried, but it is not site content and yields no content findings. */
  | 'blocked'
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
  /** Plan 075 I1: a 'redirect-interstitial' whose landing page lists this
   *  URL among its own language alternates (hreflang or language
   *  switcher). The site sent our browser to its translation because the
   *  audit locale is French (trade-off 115); a visitor in the page's own
   *  language stays on it. It is a real page left unanalysed, never a
   *  redirect: no sitemap or hreflang rule counts it, and the coverage
   *  discloses it as another-language version. Assigned after the whole
   *  scan by markLanguageRedirects, since the landing page's alternates are
   *  only known once it is scanned. */
  | 'language-redirect'
  /** A 200 response that tells the visitor the page does not exist (issue
   *  #302): an error template served under its own URL. Decided post-hoc
   *  in write-audit.ts from the page's slug, title and h1, the same
   *  after-the-scan point 'redirect-interstitial' is decided at, and with
   *  the same consequence - inventoried and disclosed, never given
   *  analysisCoverage, so it counts towards neither the analysed-page
   *  list nor any per-page denominator. */
  | 'soft-error-page'
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

export interface AuditPushbackEvent {
  pageUrl: string;
  kind: 'rate-limit' | 'bot-challenge' | 'origin-transient';
  fetcher: 'crawl' | 'render' | 'lighthouse' | 'canonical';
  occurredAt: string;
  status?: number;
  /** The Retry-After the site sent, uncapped. */
  retryAfterMs?: number;
  /** The site's Retry-After exceeded the backoff cap, so the run waited
   *  only the cap; absent on older runs and when it did not. */
  retryAfterCapped?: boolean;
  /** Delay between request starts after this event; absent on older runs. */
  delayMs?: number;
  /** The delay was already at the backoff cap when this event arrived. */
  atMaxDelay?: boolean;
}

/** A lower request-start delay reached after sustained clean requests. */
export interface AuditPacingRecoveryEvent {
  delayMs: number;
  occurredAt: string;
}

export interface ManifestPageEntry {
  url: string;
  /** The page's own declared content language (lowercased <html lang>),
   *  recorded for every visited page whose head metadata was extracted.
   *  Optional because historical manifests predate it (issue #290): the
   *  report's language-coverage sentence uses it to attribute a page at
   *  the site root - no /fr/-style path prefix - to the language the site
   *  itself declares, instead of treating it as having no language. */
  language?: string;
  /** The page declared noindex through page metadata or an X-Robots-Tag.
   *  Kept as coverage evidence so SEO-scope disclosure does not have to
   *  infer it from findings. Optional for historical manifests. */
  noindex?: boolean;
  /** Structural E9 evidence for a sitemap-only non-public plugin object.
   *  It remains inventoried and disclosed, but is not content-analysed. */
  pluginObject?: { postType: string; bodyClass: string };
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
  /** Issue #301: what the no-JavaScript pass actually fetched for this
   *  page. Kept in the manifest, not only in the scan artifact, so the
   *  report can apply normalize-renderdiff.ts's unusableRawFetches to the
   *  same evidence normalization used and never draw a comparison bar
   *  from a fetch that did not receive the page. Absent for manifests
   *  captured before this field existed. */
  renderDiffRawDocument?: RawDocumentSignals;
  lighthouseExcludedCategoryScores?: LighthouseExcludedCategoryScores;
  /** Recorded for every page with a successful Lighthouse pass,
   *  regardless of score, so a page with good vitals isn't lost the way
   *  it is in findings.json (which only carries these numbers for pages
   *  that failed Lighthouse's emission threshold). Absent for audits
   *  captured before Milestone 6 and for pages whose Lighthouse pass
   *  failed entirely; report generation must render an explicit "not
   *  measured" state rather than assume this field exists. */
  coreWebVitals?: CoreWebVitals;
  /** Metrics whose repeated lab runs contradicted each other on this page.
   *  Their value in `coreWebVitals` is kept as evidence but reported as an
   *  unstable measurement, never aggregated. Absent when none did, and on
   *  audits scanned before measurement sets. */
  unstableLabMetrics?: CoreWebVitalMetricKey[];
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
  /** Populated only for statuses 'redirect-interstitial' and
   *  'language-redirect': the URL the browser actually landed on. Traceability only, not required for any
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

export interface AuditManifest {
  auditId: string;
  /** Durable prospect hub link. Absent on historical and unattached scans. */
  prospectId?: string;
  /** Durable reason for a single-site operator scan. Absent on historical
   *  audits and internal bounded prospecting batches, which must fail closed
   *  for outreach qualification. */
  scanIntent?: ScanIntent;
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
    /** Identity of the page the requested start URL landed on, when it was
     *  different from the requested identity. */
    homepageUrl?: string;
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
    /** Eligible sitemap identities retained for offline public-evidence tests. */
    sitemapUrls?: string[];
  };
  /** Host pushback observed during acquisition, kept for operator coverage
   *  feedback and absent on historical manifests. */
  pushbackEvents?: AuditPushbackEvent[];
  /** Scheduler delay reductions after sustained clean request starts. */
  pacingRecoveryEvents?: AuditPacingRecoveryEvent[];
  /** E12: site-wide absence checks that cannot make a complete claim because
   *  one or more candidate URLs were blocked or failed acquisition. */
  coverageLimitations?: CoverageLimitation[];
  pages: ManifestPageEntry[];
  /** Plan 021. Bounded crawl-frontier omissions, stored separately from
   *  inventoried pages so an omitted URL is never presented as visited. */
  continuationGuardSummary?: ContinuationGuardSummary;
  /** Relative-link nesting omissions, disclosed separately from the
   * continuation-family guard because they indicate a URL construction bug. */
  relativeLinkNestingSummary?: {
    omittedUrlCount: number;
    omittedExampleUrls: string[];
    repeatedSegments: string[];
  };
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
}
