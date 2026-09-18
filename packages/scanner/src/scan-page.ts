import type { Browser } from 'playwright';
import type { Result as LighthouseResult } from 'lighthouse';
import type {
  TransactionalFlowAmbiguity,
  TransactionalFlowEvidence,
  TransactionalFlowRedirectCheck,
} from '@odysseus/core';
import { type AxeResults, runAxe } from './axe.js';
import { runLighthouseIsolated } from './lighthouse-isolated.js';
import { renderDiff, type RenderDiffOutcome } from './render-diff.js';
import {
  extractMentionsLegales,
  type MentionsLegalesExtraction,
} from './checks/mentions-legales.js';
import {
  detectTransactionalFlow,
  detectUnresolvedBookingControls,
  findDelegatedBookingRedirectChecks,
  type RedirectHostCache,
} from './checks/transactional-flow.js';
import { extractHeadMetadata, type HeadMetadataExtraction } from './checks/head-metadata.js';
import type { SitemapCheckResult } from './checks/sitemap.js';
import type { LlmsTxtCheckResult } from './checks/llms-txt.js';
import {
  checkCanonicalTarget,
  type CanonicalTargetCheckResult,
} from './checks/canonical-target.js';
import { getPageTimeoutMs } from './config.js';
import {
  extractMixedContentResources,
  type MixedContentExtraction,
} from './checks/mixed-content.js';
import {
  walkKeyboardNavigation,
  type KeyboardNavigationExtraction,
} from './checks/keyboard-navigation.js';
import {
  checkFormErrorHandling,
  type FormErrorHandlingExtraction,
} from './checks/form-error-handling.js';
import { checkVideoCaptions, type VideoCaptionsExtraction } from './checks/video-captions.js';
import {
  checkPlaceholderLabels,
  type PlaceholderLabelsExtraction,
} from './checks/placeholder-labels.js';
import { extractAltTextFacts, type AltTextExtraction } from './checks/alt-text.js';
import type { CookieConsentCheckResult } from './checks/cookie-consent.js';
import type { AccessibilityStatementCheckResult } from './checks/accessibility-statement.js';
import { checkNapConsistency, type NapConsistencyCheckResult } from './checks/nap-consistency.js';
import { checkReflow, type ReflowCheckResult } from './checks/reflow.js';
import { checkHtmlValidity, type HtmlValidityCheckResult } from './checks/html-validity.js';
import type { SecurityHeadersCheckResult } from './checks/security-headers.js';
import { checkStructuredData, type StructuredDataCheckResult } from './checks/structured-data.js';
import {
  extractRenderedDomCostFacts,
  recordRenderedResourceTotals,
} from './checks/rendered-cost-profile.js';
import type { RenderedCostProfile } from './full-audit-plan.js';
import { findPublishedRoleContact, type PublishedRoleContact } from './role-contact.js';
import type { CheckExecutionOutcome, CheckId } from './check-scope-coverage.js';
import type { PageWorkGuard } from './page-work-guard.js';
import type { AcquisitionAttemptRecord } from './check-attempt-ledger.js';
import type { HostRequestScheduler } from './host-request-scheduler.js';
import type { NetworkSafetyDisposition, NetworkTargetPolicy } from './network-target-policy.js';
import {
  observeFrames,
  type FrameObservation,
  type RenderedReadinessObservation,
} from './page-readiness.js';
import { extractStructuralAnchor, type StructuralAnchor } from './temporal-anchors.js';

export interface ScanPageOptions {
  /** Politeness delay applied between the raw/rendered/Lighthouse passes. */
  delayMs?: number;
  /** Plan 059: run-wide host scheduler. The outer lane owns the first
   *  navigation; inner rendered/Lighthouse navigations use scheduler.pace(). */
  scheduler?: HostRequestScheduler;
  timeoutMs?: number;
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
}

/**
 * Raw output of all three scanner passes for one page. Each field is
 * independently fallible: a Lighthouse timeout on one page must not lose
 * the render-diff or axe results already gathered for that same page.
 */
export interface PageScanResult {
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
}

export interface LighthouseAnalysisResult {
  lighthouse?: LighthouseResult;
  lighthouseError?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lighthouse times its own gather/audit phases via Node's process-global
 * perf_hooks Performance API (through the `marky`/`lighthouse-logger`
 * deps), not anything scoped to the browser or debugPort. Two `lighthouse()`
 * calls racing in the same process step on each other's marks and fail with
 * "performance mark has not been set" - confirmed by running scanSite's
 * concurrent lanes against the fixture, 100% reproducible. Concurrent
 * render-diff/axe work (plain Playwright, no shared Node-global state) is
 * unaffected, so only the Lighthouse call itself is serialized here, across
 * every lane in a scanSite() run.
 *
 * runLighthouseIsolated (lighthouse-isolated.ts) now runs each call in its
 * own forked child process rather than in this one, which incidentally
 * means the perf_hooks collision this queue exists for can no longer
 * happen either (each fork gets its own fresh globals) - but the queue
 * stays, now for two other reasons. Removing it would mean N Lighthouse
 * children (each holding a Chromium page load's worth of memory) running at
 * once instead of one. More importantly, Lighthouse is the only pass that
 * measures time: its throttling scales observed work up to model a slower
 * device, so siblings competing for the same cores bias every number the
 * same direction rather than scattering noise around a true value, and
 * those numbers are the Core Web Vitals a paying client is shown. Don't
 * remove this without a measured drift budget on those metrics; see the
 * trade-off log, entry 10.
 */
let lighthouseQueue: Promise<unknown> = Promise.resolve();

async function runLighthouseSerialized(
  url: string,
  debugPort: number,
  beforeRun?: () => Promise<void>,
): Promise<LighthouseResult> {
  const run = lighthouseQueue.then(async () => {
    await beforeRun?.();
    return runLighthouseIsolated(url, debugPort);
  });
  lighthouseQueue = run.catch(() => undefined);
  return run;
}

/**
 * Runs render diff, axe, and every other check that reuses that same
 * rendered navigation (plan 021 Step 5: extracted from the former
 * `scanPage`, same checks, same order, no Lighthouse). Reuses a single
 * rendered navigation for axe-core and every custom check (via renderDiff's
 * onRenderedPage hook) and the resource/DOM facts behind
 * `renderedCostProfile` (via onRenderedPageCreated, attached before
 * navigation so no response is missed), so only two page loads are made
 * under our own control (raw + rendered) - Lighthouse, when it runs at
 * all, performs its own separate navigation and lives in
 * `runLighthouseAnalysis` instead.
 */
export async function runRenderedAnalysis(
  browser: Browser,
  url: string,
  options: RenderedAnalysisOptions,
): Promise<RenderedAnalysisResult> {
  const checkOutcomes: Partial<Record<CheckId, CheckExecutionOutcome>> = {};
  const result: Omit<RenderedAnalysisResult, 'checkOutcomes'> = { url };

  if (options.sitemapCheck !== undefined && url === options.homepageUrl) {
    result.sitemapCheck = { ...options.sitemapCheck, pageUrl: url };
    checkOutcomes['sitemap-check'] = 'completed';
  } else {
    checkOutcomes['sitemap-check'] = 'not-applicable';
  }
  if (options.llmsTxtCheck !== undefined && url === options.homepageUrl) {
    result.llmsTxtCheck = options.llmsTxtCheck;
    checkOutcomes['llms-txt-check'] = 'completed';
  } else {
    checkOutcomes['llms-txt-check'] = 'not-applicable';
  }
  if (options.cookieConsentCheck !== undefined && url === options.homepageUrl) {
    result.cookieConsent = options.cookieConsentCheck;
    checkOutcomes['cookie-consent'] = 'completed';
  } else {
    checkOutcomes['cookie-consent'] = 'not-applicable';
  }

  if (options.accessibilityStatementCheck !== undefined && url === options.homepageUrl) {
    result.accessibilityStatement = options.accessibilityStatementCheck;
    checkOutcomes['accessibility-statement'] = 'completed';
  } else {
    checkOutcomes['accessibility-statement'] = 'not-applicable';
  }

  if (options.securityHeadersCheck !== undefined && url === options.homepageUrl) {
    result.securityHeaders = options.securityHeadersCheck;
    checkOutcomes['security-headers'] = 'completed';
  } else {
    checkOutcomes['security-headers'] = 'not-applicable';
  }

  let axeResult: AxeResults | undefined;
  let axeError: string | undefined;
  let mentionsLegalesResult: MentionsLegalesExtraction | undefined;
  let mentionsLegalesError: string | undefined;
  let transactionalFlowEvidence: TransactionalFlowEvidence[] | undefined;
  let transactionalFlowRedirectChecks: TransactionalFlowRedirectCheck[] | undefined;
  let transactionalFlowAmbiguities: TransactionalFlowAmbiguity[] | undefined;
  let headMetadataResult: HeadMetadataExtraction | undefined;
  let headMetadataError: string | undefined;
  let roleContactResult: PublishedRoleContact | undefined;
  let canonicalTargetResult: CanonicalTargetCheckResult | undefined;
  let mixedContentResult: MixedContentExtraction | undefined;
  let mixedContentError: string | undefined;
  let keyboardNavigationResult: KeyboardNavigationExtraction | undefined;
  let keyboardNavigationError: string | undefined;
  let formErrorHandlingResult: FormErrorHandlingExtraction | undefined;
  let formErrorHandlingError: string | undefined;
  let videoCaptionsResult: VideoCaptionsExtraction | undefined;
  let videoCaptionsError: string | undefined;
  let altTextResult: AltTextExtraction | undefined;
  let altTextError: string | undefined;
  let placeholderLabelsResult: PlaceholderLabelsExtraction | undefined;
  let placeholderLabelsError: string | undefined;
  let structuredDataResult: StructuredDataCheckResult | undefined;
  let napConsistencyResult: NapConsistencyCheckResult | undefined;
  let reflowResult: ReflowCheckResult | undefined;
  let htmlValidityResult: HtmlValidityCheckResult | undefined;
  let structuredDataError: string | undefined;
  let renderedCostProfile: RenderedCostProfile | undefined;

  try {
    let readResourceTotals:
      | (() => Promise<{
          resourceCount: number;
          knownTransferBytes: number;
          unknownTransferSizeCount: number;
        }>)
      | undefined;

    result.renderDiff = await renderDiff(browser, url, {
      screenshotDir: options.screenshotDir,
      isHomepage: url === options.homepageUrl,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
      ...(options.scheduler !== undefined
        ? { beforeRenderedNavigation: () => options.scheduler!.pace() }
        : options.delayMs !== undefined
          ? { preRenderedDelayMs: options.delayMs }
          : {}),
      ...(options.guard !== undefined ? { guard: options.guard } : {}),
      ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
      ...(options.onNetworkSafetyBlocked !== undefined
        ? { onNetworkSafetyBlocked: options.onNetworkSafetyBlocked }
        : {}),
      onReadinessObserved: (observation) => {
        result.readiness = observation;
      },
      onRawDocument: (html) => {
        result.structuralAnchor = extractStructuralAnchor(html, url, new Date());
      },
      onRenderedPageCreated: async (page) => {
        // Must be attached before navigation - see
        // rendered-cost-profile.ts's own doc comment.
        readResourceTotals = recordRenderedResourceTotals(page);
      },
      onRenderedPage: async (page) => {
        try {
          axeResult = await runAxe(page);
          checkOutcomes.axe = 'completed';
        } catch (error) {
          axeError = toErrorMessage(error);
          checkOutcomes.axe = 'failed';
        }
        try {
          result.frames = await observeFrames(page, url);
        } catch {
          // No frame record is itself recorded: the evidence graph treats a
          // page without one as frame coverage unknown, never as frame-free.
          delete result.frames;
        }

        if (options.mentionsLegalesUrl !== undefined && url === options.mentionsLegalesUrl) {
          try {
            const bodyText = await page.evaluate(() => document.body.innerText);
            mentionsLegalesResult = extractMentionsLegales(url, bodyText);
            mentionsLegalesResult.checkedPages = {
              resolvedUrl: options.mentionsLegalesUrl,
              homepageFallback: options.mentionsLegalesHomepageFallback ?? false,
              searchedUrls: options.mentionsLegalesSearchedUrls ?? [],
            };
            checkOutcomes['mentions-legales'] = 'completed';
          } catch (error) {
            mentionsLegalesError = toErrorMessage(error);
            checkOutcomes['mentions-legales'] = 'failed';
          }
        } else {
          checkOutcomes['mentions-legales'] = 'not-applicable';
        }

        try {
          transactionalFlowEvidence = await detectTransactionalFlow(page, url);
          checkOutcomes['transactional-flow-evidence'] = 'completed';
        } catch {
          // Transactional-flow detection is best-effort evidence, not a
          // finding: a failure here must not surface as a page error the
          // way axe/render-diff failures do, and an empty result is
          // already the correct fallback for "nothing detected".
          transactionalFlowEvidence = [];
          checkOutcomes['transactional-flow-evidence'] = 'failed';
        }

        try {
          transactionalFlowRedirectChecks = await findDelegatedBookingRedirectChecks(page, url, {
            browser,
            ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
            ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
            ...(options.redirectHostCache !== undefined
              ? { hostCache: options.redirectHostCache }
              : {}),
            ...(options.bookingEngineUrl !== undefined
              ? { bookingEngineUrl: options.bookingEngineUrl }
              : {}),
            ...(options.guard !== undefined ? { guard: options.guard } : {}),
          });
          checkOutcomes['transactional-flow-redirect-checks'] = 'completed';
          // Only a confirmed single-property redirect promotes to
          // transactional-flow evidence (drives hasTransactionalFlow);
          // 'marketplace' and 'undetermined' checks stay recorded on
          // transactionalFlowRedirectChecks only, per the "attach
          // evidence for whatever was concluded, not just the boolean"
          // rule.
          for (const check of transactionalFlowRedirectChecks) {
            if (check.resolution === 'single-property') {
              transactionalFlowEvidence.push({
                kind: 'delegated-booking-redirect',
                selector: 'a[href]',
                pageUrl: url,
                detail: check.detail,
                providerUrl: check.destinationUrl ?? check.linkUrl,
              });
            }
          }
        } catch {
          // Same best-effort posture as detectTransactionalFlow above: a
          // failure to follow a redirect must not surface as a page
          // error, and an empty result is the correct fallback.
          transactionalFlowRedirectChecks = [];
          checkOutcomes['transactional-flow-redirect-checks'] = 'failed';
        }

        try {
          transactionalFlowAmbiguities = await detectUnresolvedBookingControls(page, url);
          checkOutcomes['transactional-flow-ambiguities'] = 'completed';
        } catch {
          // Same best-effort posture as the two transactional-flow passes
          // above: a failure here must not surface as a page error, an
          // empty result is the fallback, and the failed outcome is still
          // recorded in checkOutcomes rather than silently dropped.
          transactionalFlowAmbiguities = [];
          checkOutcomes['transactional-flow-ambiguities'] = 'failed';
        }

        try {
          headMetadataResult = await extractHeadMetadata(page, url);
          checkOutcomes['head-metadata'] = 'completed';
        } catch (error) {
          headMetadataError = toErrorMessage(error);
          checkOutcomes['head-metadata'] = 'failed';
        }

        // Best effort: a missed address only leaves the operator to find it
        // by hand, so a failure here is not a check outcome.
        roleContactResult = await findPublishedRoleContact(page, url).catch(() => undefined);

        // Only meaningful once headMetadataResult exists and names
        // exactly one canonical URL - zero means nothing to check, more
        // than one is already normalize-head-metadata.ts's
        // canonical-conflicting check's job, not this one's. A failure
        // here is folded into "no result" rather than a separate error
        // field: checkCanonicalTarget already returns fetchError inside
        // its own result for a failed fetch, and null for "nothing to
        // check", so there is nothing left for a thrown error to mean
        // here in practice - kept in a try purely as defensive coding
        // for an unexpected throw (e.g. a malformed pageUrl).
        if (headMetadataResult?.canonicalUrls.length === 1) {
          try {
            canonicalTargetResult =
              (await checkCanonicalTarget(
                url,
                headMetadataResult.canonicalUrls[0]!,
                options.timeoutMs ?? getPageTimeoutMs(),
              )) ?? undefined;
            checkOutcomes['canonical-target'] = 'completed';
          } catch {
            canonicalTargetResult = undefined;
            checkOutcomes['canonical-target'] = 'failed';
          }
        } else {
          checkOutcomes['canonical-target'] = 'not-applicable';
        }

        try {
          mixedContentResult = await extractMixedContentResources(page, url);
          checkOutcomes['mixed-content'] = 'completed';
        } catch (error) {
          mixedContentError = toErrorMessage(error);
          checkOutcomes['mixed-content'] = 'failed';
        }

        try {
          videoCaptionsResult = await checkVideoCaptions(page, url);
          checkOutcomes['video-captions'] = 'completed';
        } catch (error) {
          videoCaptionsError = toErrorMessage(error);
          checkOutcomes['video-captions'] = 'failed';
        }

        try {
          placeholderLabelsResult = await checkPlaceholderLabels(page, url);
          checkOutcomes['placeholder-labels'] = 'completed';
        } catch (error) {
          placeholderLabelsError = toErrorMessage(error);
          checkOutcomes['placeholder-labels'] = 'failed';
        }

        try {
          altTextResult = await extractAltTextFacts(page, url);
          checkOutcomes['alt-text'] = 'completed';
        } catch (error) {
          altTextError = toErrorMessage(error);
          checkOutcomes['alt-text'] = 'failed';
        }

        try {
          structuredDataResult = await checkStructuredData(page, url);
          checkOutcomes['structured-data'] = 'completed';
        } catch (error) {
          structuredDataError = toErrorMessage(error);
          checkOutcomes['structured-data'] = 'failed';
        }

        // C7: reads page.content() only, no DOM mutation, so it sits with
        // the other read-only checks rather than late with the ones that
        // send input events.
        try {
          htmlValidityResult = await checkHtmlValidity(page, url);
          checkOutcomes['html-validity'] = 'completed';
        } catch {
          htmlValidityResult = undefined;
          checkOutcomes['html-validity'] = 'failed';
        }

        // The rendered-cost profile is read-only, same posture as
        // html-validity above: no dedicated registry entry of its own
        // (it feeds the Lighthouse tie-break, not a client-facing
        // finding), so no checkOutcomes entry either.
        try {
          const domCostFacts = await extractRenderedDomCostFacts(page);
          const resourceTotals = (await readResourceTotals?.()) ?? {
            resourceCount: 0,
            knownTransferBytes: 0,
            unknownTransferSizeCount: 0,
          };
          renderedCostProfile = { url, ...domCostFacts, ...resourceTotals };
        } catch {
          renderedCostProfile = undefined;
        }

        // C6: needs headMetadataResult's parsed JSON-LD, so it runs after
        // the extraction above rather than alongside it. Best-effort, like
        // transactional-flow detection: a failure here is the absence of a
        // comparison, not a page error worth surfacing to the client.
        if (headMetadataResult !== undefined) {
          try {
            napConsistencyResult = await checkNapConsistency(
              page,
              url,
              headMetadataResult.jsonLdBlocks,
            );
            checkOutcomes['nap-consistency'] = 'completed';
          } catch {
            napConsistencyResult = undefined;
            checkOutcomes['nap-consistency'] = 'failed';
          }
        } else {
          checkOutcomes['nap-consistency'] = 'not-applicable';
        }

        // Runs after every read-only DOM check above: this is the only
        // other check on the page that sends real input events, so it
        // goes late purely so a future check added here never has to
        // reason about DOM state a Tab walk might have changed (focus
        // styles, a dropdown opened on :focus, etc.).
        try {
          keyboardNavigationResult = await walkKeyboardNavigation(page, url);
          checkOutcomes['keyboard-navigation'] = 'completed';
        } catch (error) {
          keyboardNavigationError = toErrorMessage(error);
          checkOutcomes['keyboard-navigation'] = 'failed';
        }

        // Runs last of all: the only check that triggers form
        // validation on the page (see form-error-handling.ts's own file
        // header for the safety reasoning - request-blocking route,
        // never a real click or submit()). Kept last so nothing else
        // this hook does can be affected by it.
        try {
          formErrorHandlingResult = await checkFormErrorHandling(page, url);
          checkOutcomes['form-error-handling'] = 'completed';
        } catch (error) {
          formErrorHandlingError = toErrorMessage(error);
          checkOutcomes['form-error-handling'] = 'failed';
        }

        // C3: genuinely last. This is the only check that changes the
        // viewport, which re-runs every media query and any resize
        // listener on the page - far more disruptive to a later check
        // than the Tab walk or the form-validation trigger above. It
        // restores the original viewport in its own finally block, but
        // ordering it last means nothing depends on that having worked.
        try {
          reflowResult = await checkReflow(page, url);
          checkOutcomes.reflow = 'completed';
        } catch {
          reflowResult = undefined;
          checkOutcomes.reflow = 'failed';
        }
      },
    });
    checkOutcomes['render-diff'] = 'completed';
  } catch (error) {
    result.renderDiffError = toErrorMessage(error);
    checkOutcomes['render-diff'] = 'failed';
    // Every downstream check that reuses this same rendered navigation
    // never ran at all when the navigation itself failed.
    checkOutcomes.axe = 'not-applicable';
  }

  if (axeResult !== undefined) result.axe = axeResult;
  if (axeError !== undefined) result.axeError = axeError;
  if (mentionsLegalesResult !== undefined) result.mentionsLegales = mentionsLegalesResult;
  if (mentionsLegalesError !== undefined) result.mentionsLegalesError = mentionsLegalesError;
  if (transactionalFlowEvidence !== undefined)
    result.transactionalFlowEvidence = transactionalFlowEvidence;
  if (transactionalFlowRedirectChecks !== undefined)
    result.transactionalFlowRedirectChecks = transactionalFlowRedirectChecks;
  if (transactionalFlowAmbiguities !== undefined)
    result.transactionalFlowAmbiguities = transactionalFlowAmbiguities;
  if (headMetadataResult !== undefined) result.headMetadata = headMetadataResult;
  if (roleContactResult !== undefined) result.roleContact = roleContactResult;
  if (headMetadataError !== undefined) result.headMetadataError = headMetadataError;
  if (canonicalTargetResult !== undefined) result.canonicalTarget = canonicalTargetResult;
  if (mixedContentResult !== undefined) result.mixedContent = mixedContentResult;
  if (mixedContentError !== undefined) result.mixedContentError = mixedContentError;
  if (keyboardNavigationResult !== undefined) result.keyboardNavigation = keyboardNavigationResult;
  if (keyboardNavigationError !== undefined)
    result.keyboardNavigationError = keyboardNavigationError;
  if (formErrorHandlingResult !== undefined) result.formErrorHandling = formErrorHandlingResult;
  if (formErrorHandlingError !== undefined) result.formErrorHandlingError = formErrorHandlingError;
  if (videoCaptionsResult !== undefined) result.videoCaptions = videoCaptionsResult;
  if (videoCaptionsError !== undefined) result.videoCaptionsError = videoCaptionsError;
  if (altTextResult !== undefined) result.altText = altTextResult;
  if (altTextError !== undefined) result.altTextError = altTextError;
  if (placeholderLabelsResult !== undefined) result.placeholderLabels = placeholderLabelsResult;
  if (placeholderLabelsError !== undefined) result.placeholderLabelsError = placeholderLabelsError;
  if (structuredDataResult !== undefined) result.structuredData = structuredDataResult;
  if (napConsistencyResult !== undefined) result.napConsistency = napConsistencyResult;
  if (reflowResult !== undefined) result.reflow = reflowResult;
  if (htmlValidityResult !== undefined) result.htmlValidity = htmlValidityResult;
  if (structuredDataError !== undefined) result.structuredDataError = structuredDataError;
  if (renderedCostProfile !== undefined) result.renderedCostProfile = renderedCostProfile;

  return { ...result, checkOutcomes };
}

/**
 * Runs Lighthouse against one page: the existing pre-Lighthouse politeness
 * delay, the process-wide serialized queue, the isolated-process
 * navigation, and the same result/error shape `scanPage` always returned
 * (plan 021 Step 5: extracted from the former `scanPage`, unchanged
 * behavior). Callers decide whether and when to call this at all - a page
 * the full-audit planner did not select for Lighthouse simply never calls
 * it.
 */
export async function runLighthouseAnalysis(
  url: string,
  debugPort: number,
  options: LighthouseAnalysisOptions = {},
): Promise<LighthouseAnalysisResult> {
  const beforeRun =
    options.scheduler !== undefined
      ? () => options.scheduler!.pace()
      : options.delayMs !== undefined && options.delayMs > 0
        ? () => sleep(options.delayMs!)
        : undefined;

  try {
    return { lighthouse: await runLighthouseSerialized(url, debugPort, beforeRun) };
  } catch (error) {
    return { lighthouseError: toErrorMessage(error) };
  }
}

/**
 * Compatibility wrapper preserving the pre-plan-021 all-in-one behavior:
 * rendered analysis followed by Lighthouse (unless skipped), returned as
 * the legacy `PageScanResult` shape. This is the only path prospecting and
 * the standalone `scan` CLI command use; both call this directly and
 * neither passes anything that would engage the full-audit planner, so
 * their existing per-page Lighthouse behavior is unchanged (see
 * `scanSite`'s own `fullAuditPlanning` option doc comment).
 */
export async function scanPage(
  browser: Browser,
  debugPort: number,
  url: string,
  options: ScanPageOptions,
): Promise<PageScanResult> {
  const {
    checkOutcomes: _checkOutcomes,
    renderedCostProfile: _renderedCostProfile,
    ...rendered
  } = await runRenderedAnalysis(browser, url, options);
  const result: PageScanResult = rendered;

  if (!options.skipLighthouse) {
    const lighthouseResult = await runLighthouseAnalysis(url, debugPort, {
      ...(options.scheduler !== undefined ? { scheduler: options.scheduler } : {}),
      ...(options.scheduler === undefined && options.delayMs !== undefined
        ? { delayMs: options.delayMs }
        : {}),
    });
    if (lighthouseResult.lighthouse !== undefined) result.lighthouse = lighthouseResult.lighthouse;
    if (lighthouseResult.lighthouseError !== undefined)
      result.lighthouseError = lighthouseResult.lighthouseError;
  }

  return result;
}
