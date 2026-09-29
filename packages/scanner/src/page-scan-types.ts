/**
 * The per-page scan options and results, apart from the functions that
 * produce them, so the check runner, the check list and the check-scope
 * registry can name them without importing scan-page.ts (issue #570).
 */

import type { Result as LighthouseResult } from 'lighthouse';
import type {
  TransactionalFlowAmbiguity,
  TransactionalFlowEvidence,
  TransactionalFlowRedirectCheck,
} from '@odysseus/core';
import type { AxeResults } from './axe.js';
import type { RenderDiffOutcome } from './render-diff.js';
import type { MentionsLegalesExtraction } from './checks/mentions-legales.js';
import type { RedirectHostCache } from './checks/transactional-flow.js';
import type { HeadMetadataExtraction } from './checks/head-metadata.js';
import type { SitemapCheckResult } from './checks/sitemap.js';
import type { LlmsTxtCheckResult } from './checks/llms-txt.js';
import type { CanonicalTargetCheckResult } from './checks/canonical-target.js';
import type { MixedContentExtraction } from './checks/mixed-content.js';
import type { KeyboardNavigationExtraction } from './checks/keyboard-navigation.js';
import type { FormErrorHandlingExtraction } from './checks/form-error-handling.js';
import type { VideoCaptionsExtraction } from './checks/video-captions.js';
import type { PlaceholderLabelsExtraction } from './checks/placeholder-labels.js';
import type { AltTextExtraction } from './checks/alt-text.js';
import type { CookieConsentCheckResult } from './checks/cookie-consent.js';
import type { AccessibilityStatementCheckResult } from './checks/accessibility-statement.js';
import type { NapConsistencyCheckResult } from './checks/nap-consistency.js';
import type { ReflowCheckResult } from './checks/reflow.js';
import type { HtmlValidityCheckResult } from './checks/html-validity.js';
import type { SecurityHeadersCheckResult } from './checks/security-headers.js';
import type { StructuredDataCheckResult } from './checks/structured-data.js';
import type { RenderedCostProfile } from './full-audit-plan.js';
import type { PublishedRoleContact } from './role-contact.js';
import type { PageWorkGuard } from './page-work-guard.js';
import type { AcquisitionAttemptRecord } from './check-attempt-ledger.js';
import type { HostRequestScheduler } from './host-request-scheduler.js';
import type { NetworkSafetyDisposition, NetworkTargetPolicy } from './network-target-policy.js';
import type { FrameObservation, RenderedReadinessObservation } from './page-readiness.js';
import type { StructuralAnchor } from './temporal-anchors.js';
import type { PerformanceMeasurementSet } from './performance-measurement-set.js';
import type { MobileSurfaceRecord } from './mobile-surface.js';
import type { SurfaceLinkDiscovery } from './surface-discovery.js';
import type { HydrationSweepRecord } from './hydration-sweep.js';
import type { ConsentSurfaceOutcome, LocalStateExplorationRecord } from './state-surface.js';
import type { ConsentBaselineObservation } from './consent-state.js';
import type {
  ScanSurface,
  SurfaceLimitationRecord,
  SurfaceSkipReason,
} from './evidence-surfaces.js';
import type { PageAuditProfile } from './page-audit-profile.js';

/** The explicit per-check outcome, keyed by a check-scope registry `id`.
 *  This is the coverage source of truth (plan 021 Target Interfaces): never
 *  derived by testing whether an optional result field exists afterwards,
 *  and never carries raw exception text. */
export type CheckExecutionOutcome = 'completed' | 'failed' | 'not-applicable';

/** A check-scope registry id (check-scope-coverage.ts). */
export type CheckId = string;

export interface ScanPageOptions {
  /** Served spelling learned during crawl, when it is identity-equivalent to
   *  `url` but the server insists on a slash or other presentation detail. */
  navigationUrl?: string;
  /** Politeness delay applied between the raw/rendered/Lighthouse passes. */
  delayMs?: number;
  /** Plan 059: run-wide host scheduler. The outer lane owns the first
   *  navigation; inner rendered/Lighthouse navigations use scheduler.pace(). */
  scheduler?: HostRequestScheduler;
  timeoutMs?: number;
  /** Aborted by scan-site when the containing page exceeds its deadline. */
  signal?: AbortSignal;
  /** Independent budget for each rendered-page check. It is deliberately
   * below the page watchdog; when a check times out, its signal is aborted
   * and later checks refuse to touch the same page. Tests may set this to a
   * small value; production derives a conservative fraction from timeoutMs. */
  checkTimeoutMs?: number;
  userAgent?: string;
  /** Milestone 9b: skips the Lighthouse pass (and the pre-Lighthouse
   *  politeness delay, since there is then nothing to space out from
   *  what follows). Lighthouse is the prospecting pipeline's
   *  serialisation bottleneck (the perf_hooks queue, trade-off 10) and
   *  Core Web Vitals are the weakest cold-outreach signal - a prospect
   *  is judged on accessibility/SEO defects, not lab performance
   *  numbers. Full audits never set this; the paid report needs the real
   *  Core Web Vitals table. */
  skipLighthouse?: boolean;
  /** Forwarded to renderDiff's own screenshotDir option (the `pages/`
   *  parent directory for this run). */
  screenshotDir: string;
  /** The one crawled URL scanSite identified as the mentions-legales
   *  page (from crawl.mentionsLegalesPageUrl). Only that page runs the
   *  SIREN/RCS/TVA text extraction; every page runs transactional-flow
   *  detection, since checkout/cart UI can appear anywhere. */
  mentionsLegalesUrl?: string;
  /** Every ranked legal page candidate; each is checked before absence is reported. */
  mentionsLegalesCandidateUrls?: string[];
  /** Plan 036: the full evidence trail for how mentionsLegalesUrl above was
   *  resolved (crawl.ts's own mentionsLegalesSearchedUrls), attached to the
   *  extraction result only for the one page that matches
   *  mentionsLegalesUrl. Omitted (rather than an empty array) when the
   *  caller has nothing to report, so the evidence payload can tell "not
   *  supplied" apart from "searched, found nothing" if that distinction
   *  ever matters. */
  mentionsLegalesSearchedUrls?: string[];
  /** Plan 036: true only when scan-site.ts's own homepage fallback picked
   *  this URL because no page matched the mentions-legales heuristic, so
   *  the evidence never implies a real URL match where there was none. */
  mentionsLegalesHomepageFallback?: boolean;
  /** Shared across every page of one scanSite() run - see
   *  transactional-flow.ts's RedirectHostCache doc comment for why a
   *  per-page cache alone isn't enough. */
  redirectHostCache?: RedirectHostCache;
  /** Manual-input-layer milestone: forwarded to
   *  findDelegatedBookingRedirectChecks, see its own doc comment. */
  bookingEngineUrl?: string;
  /** The crawl's own start URL. Only used to gate sitemapCheck below to
   *  the one page it should attach to. */
  homepageUrl?: string;
  /** Pre-fetched once per site in scanSite(), not per page - sitemap.xml
   *  is a site-level concept. Attached to this page's result only when
   *  url === homepageUrl, the same "attribute a site-level fact to the
   *  one page every site has" pattern mentionsLegalesUrl's own fallback
   *  already uses. crawledUrls (every page the crawl actually visited)
   *  is bundled alongside the fetch result here, not inside
   *  checkSitemap()'s own return type, since deciding staleness by
   *  comparing the two is core's job, not scanner's - scanner only
   *  reports facts. */
  sitemapCheck?: SitemapCheckResult & { crawledUrls: string[]; discoveredUrls: string[] };
  /** Milestone 8.5a: fetched once per site in scanSite(), same site-level
   *  attachment pattern as sitemapCheck above. */
  llmsTxtCheck?: LlmsTxtCheckResult;
  /** Milestone 8.6: fetched once per site in scanSite(), same site-level
   *  attachment pattern as sitemapCheck/llmsTxtCheck above. */
  securityHeadersCheck?: SecurityHeadersCheckResult;
  cookieConsentCheck?: CookieConsentCheckResult;
  accessibilityStatementCheck?: AccessibilityStatementCheckResult;
  /** Issue #200: tracks every context this page's work opens (render-diff's
   *  raw/rendered contexts, plus any delegated-booking-redirect probe), so
   *  scan-site.ts's per-page watchdog can force-close them if this call
   *  never returns on its own. */
  guard?: PageWorkGuard;
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: (disposition: NetworkSafetyDisposition) => void;
  /** Shared within one scanSite run to avoid re-fetching the same canonical. */
  canonicalTargetCache?: Map<string, Promise<CanonicalTargetCheckResult | null>>;
  /** Plan 059 step 11: run the bounded hydration sweep as the very last
   *  step on the rendered page, after every check (including the mutating
   *  ones) has finished, so lazy content is seen and its links discovered
   *  without ever contaminating the baseline evidence. Off by default; the
   *  Plan 059 full-audit path turns it on. */
  hydrationSweep?: boolean;
  /** Operator crawl exclusions, applied to links the hydration sweep
   *  discovers. */
  exclusionPatterns?: readonly string[];
  /** Plan 059 step 13: record the delivered consent state and explore the
   *  page's safe local-state toggles (bounded, provably same-document).
   *  Read-only except for the disclosure toggles, which run after every
   *  check like the hydration sweep. Off by default. */
  stateSurfaces?: boolean;
}

/**
 * Raw output of all three scanner passes for one page. Each field is
 * independently fallible: a Lighthouse timeout on one page must not lose
 * the render-diff or axe results already gathered for that same page.
 */
export interface PageScanResult {
  /** Disk schema marker. Missing means a legacy scan.json written before v2. */
  scanJsonVersion?: 2;
  url: string;
  renderDiff?: RenderDiffOutcome;
  renderDiffError?: string;
  axe?: AxeResults;
  axeError?: string;
  lighthouse?: LighthouseResult;
  lighthouseError?: string;
  mentionsLegales?: MentionsLegalesExtraction;
  mentionsLegalesError?: string;
  transactionalFlowEvidence?: TransactionalFlowEvidence[];
  transactionalFlowRedirectChecks?: TransactionalFlowRedirectCheck[];
  transactionalFlowAmbiguities?: TransactionalFlowAmbiguity[];
  headMetadata?: HeadMetadataExtraction;
  headMetadataError?: string;
  /** The best role address this page publishes on the site's own domain. */
  roleContact?: PublishedRoleContact;
  sitemapCheck?: SitemapCheckResult & {
    crawledUrls: string[];
    discoveredUrls: string[];
    pageUrl: string;
  };
  llmsTxtCheck?: LlmsTxtCheckResult;
  canonicalTarget?: CanonicalTargetCheckResult;
  canonicalTargetError?: string;
  mixedContent?: MixedContentExtraction;
  mixedContentError?: string;
  keyboardNavigation?: KeyboardNavigationExtraction;
  keyboardNavigationError?: string;
  formErrorHandling?: FormErrorHandlingExtraction;
  formErrorHandlingError?: string;
  videoCaptions?: VideoCaptionsExtraction;
  videoCaptionsError?: string;
  altText?: AltTextExtraction;
  altTextError?: string;
  placeholderLabels?: PlaceholderLabelsExtraction;
  placeholderLabelsError?: string;
  securityHeaders?: SecurityHeadersCheckResult;
  cookieConsent?: CookieConsentCheckResult;
  accessibilityStatement?: AccessibilityStatementCheckResult;
  napConsistency?: NapConsistencyCheckResult;
  reflow?: ReflowCheckResult;
  htmlValidity?: HtmlValidityCheckResult;
  structuredData?: StructuredDataCheckResult;
  structuredDataError?: string;
  /** Plan 035 (issue #124): persisted into scan.json by buildScanJson so a
   *  resumed run can rebuild every finalizeLighthousePlan input from disk.
   *  Always present on a RenderedAnalysisResult (which redeclares it
   *  required); optional here only because a PageScanResult can also be
   *  assembled without a rendered pass. */
  checkOutcomes?: Partial<Record<CheckId, CheckExecutionOutcome>>;
  /** Plan 035: persisted alongside checkOutcomes for the same reason; the
   *  planner replay needs every page's rendered-cost profile, so a
   *  completed page without one is never trusted on resume. */
  renderedCostProfile?: RenderedCostProfile;
  /** Plan 059: every check attempt made against this page, including
   *  failed and retried ones. Persisted with the page so a resumed run keeps
   *  the full lineage; the site ledger is assembled from these records. */
  acquisitionAttempts?: AcquisitionAttemptRecord[];
  /** Plan 059: how settled the rendered page was when checks read it. */
  readiness?: RenderedReadinessObservation;
  /** Plan 059: every child frame on the rendered page and whether axe
   *  reached it. */
  frames?: FrameObservation[];
  /** Plan 059: the served document's structure at the raw pass, for the
   *  audit's temporal-coherence verdict. */
  structuralAnchor?: StructuralAnchor;
  /** Plan 059 steps 8 and 26: the scheduling-side audit profile the crawl
   *  extracted from this same navigation, persisted so the evidence graph's
   *  report-facing semantic classifier reads persisted signals instead of
   *  re-deriving them. Absent for pages whose facts were never extracted
   *  (discovery-wave pages), which the semantic profile discloses as an
   *  explicit unknown role rather than guessing. */
  auditProfile?: PageAuditProfile;
  /** Plan 059 section 12: every Lighthouse run taken on this page and the
   *  representative drawn from them. `lighthouse` is that representative
   *  run's full report. */
  performanceMeasurement?: PerformanceMeasurementSet;
  /** Plan 059 step 10: the page's mobile surface — a second rendered pass
   *  in the stable mobile profile under the unchanged crawler identity —
   *  with its own readiness observation and bounded axe summary. Absent
   *  when the caller did not ask for mobile surfaces. */
  mobileSurface?: MobileSurfaceRecord;
  /** Plan 059: every non-baseline ScanSurface built for this page (mobile
   *  now; the consent/local-state surfaces join in step 13). Persisted so
   *  the evidence graph digests the exact surface set that ran. */
  surfaces?: ScanSurface[];
  /** A deterministic plan reason for omitted optional mobile/consent passes. */
  surfaceSkipped?: SurfaceSkipReason;
  /** Expected surface IDs omitted by plan, retained for delta comparability. */
  plannedOutOfScopeSurfaceIds?: string[];
  /** Plan 059 steps 10-13: anchors exposed only on a state surface, with
   *  the discovery source and surface the fixed-point rule needs. */
  surfaceLinks?: SurfaceLinkDiscovery[];
  /** Plan 059: state surfaces that could not run or could not prove what
   *  their profile claims, disclosed on this page's evidence instead of
   *  being silently omitted. */
  surfaceLimitations?: SurfaceLimitationRecord[];
  /** Plan 059 step 11: the bounded hydration sweep taken after every
   *  check finished with the rendered page, with the links the hydrated
   *  document exposed. Absent when the caller did not ask for a sweep. */
  hydrationSweep?: HydrationSweepRecord;
  /** Plan 059 step 13: the consent/overlay state as delivered on the
   *  baseline rendering, before any interaction. */
  consentBaseline?: ConsentBaselineObservation;
  /** Plan 059 step 13: the consent-rejected surface outcome for this page,
   *  present only when a safe deterministic rejection existed. */
  consentSurface?: ConsentSurfaceOutcome;
  /** Plan 059 step 13: transitions of the page's bounded safe local-state
   *  exploration, with the links the opened states exposed. */
  localStates?: LocalStateExplorationRecord;
}

/**
 * Options for the rendered-analysis-only function: every ScanPageOptions
 * field except `skipLighthouse`, which has no meaning here since this
 * function never runs Lighthouse at all.
 */
export type RenderedAnalysisOptions = Omit<ScanPageOptions, 'skipLighthouse'>;

/**
 * Rendered-pass output: render diff, axe, and every check that runs off
 * the same rendered navigation, plus the rendered-cost profile the
 * full-audit planner's Lighthouse tie-break needs (plan 021) and the
 * explicit per-check outcome for every registered check this function is
 * responsible for (every `check-scope-coverage.ts` entry except
 * `lighthouse`, which `runLighthouseAnalysis` owns). Never contains raw
 * exception text in `checkOutcomes` - that stays in the existing `*Error`
 * fields where one exists.
 */
export interface RenderedAnalysisResult extends Omit<
  PageScanResult,
  'lighthouse' | 'lighthouseError'
> {
  renderedCostProfile?: RenderedCostProfile;
  checkOutcomes: Partial<Record<CheckId, CheckExecutionOutcome>>;
}

export interface LighthouseAnalysisOptions {
  /** Fallback politeness delay for standalone callers without a run scheduler. */
  delayMs?: number;
  /** Plan 059: waits for a request slot without acquiring another lane. */
  scheduler?: HostRequestScheduler;
  navigationUrl?: string;
}

export interface LighthouseAnalysisResult {
  lighthouse?: LighthouseResult;
  lighthouseError?: string;
}
