import type { Browser } from 'playwright';
import type { Result as LighthouseResult } from 'lighthouse';
import type { RenderDiffResult, TransactionalFlowEvidence, TransactionalFlowRedirectCheck } from '@odysseus/core';
import { type AxeResults, runAxe } from './axe.js';
import { runLighthouseIsolated } from './lighthouse-isolated.js';
import { renderDiff } from './render-diff.js';
import { extractMentionsLegales, type MentionsLegalesExtraction } from './checks/mentions-legales.js';
import {
  detectTransactionalFlow,
  findDelegatedBookingRedirectChecks,
  type RedirectHostCache,
} from './checks/transactional-flow.js';
import { extractHeadMetadata, type HeadMetadataExtraction } from './checks/head-metadata.js';
import type { SitemapCheckResult } from './checks/sitemap.js';
import type { LlmsTxtCheckResult } from './checks/llms-txt.js';
import { checkCanonicalTarget, type CanonicalTargetCheckResult } from './checks/canonical-target.js';
import { getPageTimeoutMs } from './config.js';
import { extractMixedContentResources, type MixedContentExtraction } from './checks/mixed-content.js';
import { walkKeyboardNavigation, type KeyboardNavigationExtraction } from './checks/keyboard-navigation.js';
import { checkFormErrorHandling, type FormErrorHandlingExtraction } from './checks/form-error-handling.js';
import { checkVideoCaptions, type VideoCaptionsExtraction } from './checks/video-captions.js';
import { extractAltTextFacts, type AltTextExtraction } from './checks/alt-text.js';
import type { CookieConsentCheckResult } from './checks/cookie-consent.js';
import type { SecurityHeadersCheckResult } from './checks/security-headers.js';
import { checkStructuredData, type StructuredDataCheckResult } from './checks/structured-data.js';

export interface ScanPageOptions {
  /** Politeness delay applied between the raw/rendered/Lighthouse passes. */
  delayMs?: number;
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
}

/**
 * Raw output of all three scanner passes for one page. Each field is
 * independently fallible: a Lighthouse timeout on one page must not lose
 * the render-diff or axe results already gathered for that same page.
 */
export interface PageScanResult {
  url: string;
  renderDiff?: RenderDiffResult;
  renderDiffError?: string;
  axe?: AxeResults;
  axeError?: string;
  lighthouse?: LighthouseResult;
  lighthouseError?: string;
  mentionsLegales?: MentionsLegalesExtraction;
  mentionsLegalesError?: string;
  transactionalFlowEvidence?: TransactionalFlowEvidence[];
  transactionalFlowRedirectChecks?: TransactionalFlowRedirectCheck[];
  headMetadata?: HeadMetadataExtraction;
  headMetadataError?: string;
  sitemapCheck?: SitemapCheckResult & { crawledUrls: string[]; discoveredUrls: string[]; pageUrl: string };
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
  securityHeaders?: SecurityHeadersCheckResult;
  cookieConsent?: CookieConsentCheckResult;
  structuredData?: StructuredDataCheckResult;
  structuredDataError?: string;
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
 * stays. Removing it would mean N Lighthouse children (each holding a
 * Chromium page load's worth of memory) running at once instead of one,
 * and that tradeoff hasn't been evaluated; per the project's trade-off
 * log, don't remove this without confirming that separately.
 */
let lighthouseQueue: Promise<unknown> = Promise.resolve();

async function runLighthouseSerialized(url: string, debugPort: number): Promise<LighthouseResult> {
  const run = lighthouseQueue.then(() => runLighthouseIsolated(url, debugPort));
  lighthouseQueue = run.catch(() => undefined);
  return run;
}

/**
 * Scans one page with all three scanners, reusing a single rendered
 * navigation for both render-diff's text/screenshot extraction and
 * axe-core (via renderDiff's onRenderedPage hook), so only two page loads
 * are made under our own control (raw + rendered). Lighthouse performs its
 * own separate navigation over the CDP debugPort, since it cannot attach
 * to an already-loaded Playwright page.
 */
export async function scanPage(
  browser: Browser,
  debugPort: number,
  url: string,
  options: ScanPageOptions,
): Promise<PageScanResult> {
  const result: PageScanResult = { url };
  if (options.sitemapCheck !== undefined && url === options.homepageUrl) {
    result.sitemapCheck = { ...options.sitemapCheck, pageUrl: url };
  }
  if (options.llmsTxtCheck !== undefined && url === options.homepageUrl) {
    result.llmsTxtCheck = options.llmsTxtCheck;
  }
  if (options.cookieConsentCheck !== undefined && url === options.homepageUrl) {
    result.cookieConsent = options.cookieConsentCheck;
  }

  if (options.securityHeadersCheck !== undefined && url === options.homepageUrl) {
    result.securityHeaders = options.securityHeadersCheck;
  }
  let axeResult: AxeResults | undefined;
  let axeError: string | undefined;
  let mentionsLegalesResult: MentionsLegalesExtraction | undefined;
  let mentionsLegalesError: string | undefined;
  let transactionalFlowEvidence: TransactionalFlowEvidence[] | undefined;
  let transactionalFlowRedirectChecks: TransactionalFlowRedirectCheck[] | undefined;
  let headMetadataResult: HeadMetadataExtraction | undefined;
  let headMetadataError: string | undefined;
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
  let structuredDataResult: StructuredDataCheckResult | undefined;
  let structuredDataError: string | undefined;

  try {
    result.renderDiff = await renderDiff(browser, url, {
      screenshotDir: options.screenshotDir,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
      ...(options.delayMs !== undefined ? { preRenderedDelayMs: options.delayMs } : {}),
      onRenderedPage: async (page) => {
        try {
          axeResult = await runAxe(page);
        } catch (error) {
          axeError = toErrorMessage(error);
        }

        if (options.mentionsLegalesUrl !== undefined && url === options.mentionsLegalesUrl) {
          try {
            const bodyText = await page.evaluate(() => document.body.innerText);
            mentionsLegalesResult = extractMentionsLegales(url, bodyText);
          } catch (error) {
            mentionsLegalesError = toErrorMessage(error);
          }
        }

        try {
          transactionalFlowEvidence = await detectTransactionalFlow(page, url);
        } catch {
          // Transactional-flow detection is best-effort evidence, not a
          // finding: a failure here must not surface as a page error the
          // way axe/render-diff failures do, and an empty result is
          // already the correct fallback for "nothing detected".
          transactionalFlowEvidence = [];
        }

        try {
          transactionalFlowRedirectChecks = await findDelegatedBookingRedirectChecks(page, url, {
            browser,
            ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
            ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
            ...(options.redirectHostCache !== undefined ? { hostCache: options.redirectHostCache } : {}),
            ...(options.bookingEngineUrl !== undefined ? { bookingEngineUrl: options.bookingEngineUrl } : {}),
          });
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
        }

        try {
          headMetadataResult = await extractHeadMetadata(page, url);
        } catch (error) {
          headMetadataError = toErrorMessage(error);
        }

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
          } catch {
            canonicalTargetResult = undefined;
          }
        }

        try {
          mixedContentResult = await extractMixedContentResources(page, url);
        } catch (error) {
          mixedContentError = toErrorMessage(error);
        }

        try {
          videoCaptionsResult = await checkVideoCaptions(page, url);
        } catch (error) {
          videoCaptionsError = toErrorMessage(error);
        }

        try {
          altTextResult = await extractAltTextFacts(page, url);
        } catch (error) {
          altTextError = toErrorMessage(error);
        }

        try {
          structuredDataResult = await checkStructuredData(page, url);
        } catch (error) {
          structuredDataError = toErrorMessage(error);
        }

        // Runs after every read-only DOM check above: this is the only
        // other check on the page that sends real input events, so it
        // goes late purely so a future check added here never has to
        // reason about DOM state a Tab walk might have changed (focus
        // styles, a dropdown opened on :focus, etc.).
        try {
          keyboardNavigationResult = await walkKeyboardNavigation(page, url);
        } catch (error) {
          keyboardNavigationError = toErrorMessage(error);
        }

        // Runs last of all: the only check that triggers form
        // validation on the page (see form-error-handling.ts's own file
        // header for the safety reasoning - request-blocking route,
        // never a real click or submit()). Kept last so nothing else
        // this hook does can be affected by it.
        try {
          formErrorHandlingResult = await checkFormErrorHandling(page, url);
        } catch (error) {
          formErrorHandlingError = toErrorMessage(error);
        }
      },
    });
  } catch (error) {
    result.renderDiffError = toErrorMessage(error);
  }

  if (axeResult !== undefined) result.axe = axeResult;
  if (axeError !== undefined) result.axeError = axeError;
  if (mentionsLegalesResult !== undefined) result.mentionsLegales = mentionsLegalesResult;
  if (mentionsLegalesError !== undefined) result.mentionsLegalesError = mentionsLegalesError;
  if (transactionalFlowEvidence !== undefined) result.transactionalFlowEvidence = transactionalFlowEvidence;
  if (transactionalFlowRedirectChecks !== undefined) result.transactionalFlowRedirectChecks = transactionalFlowRedirectChecks;
  if (headMetadataResult !== undefined) result.headMetadata = headMetadataResult;
  if (headMetadataError !== undefined) result.headMetadataError = headMetadataError;
  if (canonicalTargetResult !== undefined) result.canonicalTarget = canonicalTargetResult;
  if (mixedContentResult !== undefined) result.mixedContent = mixedContentResult;
  if (mixedContentError !== undefined) result.mixedContentError = mixedContentError;
  if (keyboardNavigationResult !== undefined) result.keyboardNavigation = keyboardNavigationResult;
  if (keyboardNavigationError !== undefined) result.keyboardNavigationError = keyboardNavigationError;
  if (formErrorHandlingResult !== undefined) result.formErrorHandling = formErrorHandlingResult;
  if (formErrorHandlingError !== undefined) result.formErrorHandlingError = formErrorHandlingError;
  if (videoCaptionsResult !== undefined) result.videoCaptions = videoCaptionsResult;
  if (videoCaptionsError !== undefined) result.videoCaptionsError = videoCaptionsError;
  if (altTextResult !== undefined) result.altText = altTextResult;
  if (altTextError !== undefined) result.altTextError = altTextError;
  if (structuredDataResult !== undefined) result.structuredData = structuredDataResult;
  if (structuredDataError !== undefined) result.structuredDataError = structuredDataError;

  if (!options.skipLighthouse) {
    if (options.delayMs) {
      await sleep(options.delayMs);
    }

    try {
      result.lighthouse = await runLighthouseSerialized(url, debugPort);
    } catch (error) {
      result.lighthouseError = toErrorMessage(error);
    }
  }

  return result;
}
