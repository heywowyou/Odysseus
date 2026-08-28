/**
 * The hotel prescan (milestone 9c plan 004): at most three pages, no
 * Lighthouse, in roughly a minute, producing enough measured evidence to
 * decide whether a hotel is worth approaching.
 *
 * **This is not the audit pipeline and must not become it.** It deliberately
 * does not call `runAuditStage`, `scanSite`, or `scanPage`, and returns no
 * `AuditManifest` and no findings. The reason is plan 004's binding decision
 * 8: prospecting once ran through `runAuditStage` with a page cap, which
 * persisted paid-audit shapes for sites nobody had agreed to audit and left
 * nothing structural stopping the "quick" pass from growing back into a
 * multi-minute one. What it does share is every low-level primitive -
 * robots, render diff, axe, booking detection - so the two paths cannot
 * drift on what they observe, only on how much of it they do.
 *
 * Page roles are chosen from the homepage's own links rather than by crawl
 * order (see page-roles.ts for why), and every page is loaded once, with
 * axe and the direct metrics both reading the single navigation render-diff
 * already performs.
 *
 * Politeness is non-negotiable rule 5, unchanged and unweakened: robots.txt
 * is fetched and honoured per page, the delay is the stricter of the
 * configured delay and robots' own crawl-delay, it is applied between passes
 * on a page as well as between pages, the user agent identifies Odysseus,
 * and every navigation carries a hard timeout.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import {
  extractAxeCandidates,
  extractFormErrorHandlingCandidates,
  extractGeoCandidates,
  extractKeyboardNavigationCandidates,
  readJsonLdTypes,
  rankHotelSpecificFailures,
  toHotelEvidenceFact,
  type HotelEvidenceFact,
  type HotelPrescanEvidence,
  type TransactionalFlowEvidence,
} from '@odysseus/core';
import { DEFAULT_TIMEOUT_MS } from '../browser.js';
import {
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getPageTimeoutMs,
  getRenderSettleTimeoutMs,
} from '../config.js';
import { fetchRobotsRules, isAllowedByRobots, type RobotsRules } from '../robots.js';
import { renderDiff } from '../render-diff.js';
import { runAxe, type AxeResults } from '../axe.js';
import { detectTransactionalFlow, type AnchorLike } from '../checks/transactional-flow.js';
import { checkFormErrorHandling } from '../checks/form-error-handling.js';
import { extractHeadMetadata, type HeadMetadataExtraction } from '../checks/head-metadata.js';
import { walkKeyboardNavigation } from '../checks/keyboard-navigation.js';
import { measurePageMetrics, recordPageRequests, type PrescanPageMetrics } from './page-metrics.js';
import {
  selectPrescanPages,
  type PrescanPageRole,
  type PrescanPageSelection,
  type PrescanRoleAbsence,
} from './page-roles.js';
import { buildPrescanEvidence, type PrescanEvidencePage } from './evidence/build-evidence.js';
import { captureFirstMeasuredFailure, type CapturedFailureCandidate } from './evidence/capture.js';

export type PrescanStatus =
  | 'complete'
  /** The homepage itself is disallowed, so there is nothing to prescan and
   *  nothing that may politely be loaded. */
  | 'blocked-by-robots'
  /** The homepage could not be loaded at all. Every other failure is
   *  per-page and leaves a partial, still-useful result. */
  | 'homepage-unreachable';

/** Only what a prescan needs from axe: counts by impact and the rule ids,
 *  not the full node lists. The full audit's normalize layer is what turns
 *  axe output into findings, and a prescan deliberately produces no
 *  findings - keeping raw axe here would invite exactly the drift towards
 *  paid-audit shapes the header warns about. */
export interface PrescanAxeFacts {
  violationCount: number;
  byImpact: { critical: number; serious: number; moderate: number; minor: number };
  /** Sorted rule ids, so two prescans of an unchanged page compare equal. */
  ruleIds: string[];
  /** Distinct elements implicated, which is what a person reads as "how
   *  much of this page is affected". */
  affectedElementCount: number;
}

export interface PrescanPageResult {
  role: PrescanPageRole;
  url: string;
  httpStatus?: number;
  /** Render-diff's own headline number: how much of the page's text is
   *  invisible without JavaScript. */
  missingPercent?: number;
  rawTextLength?: number;
  renderedTextLength?: number;
  /** Relative to the prescan directory, never absolute, so a stored prescan
   *  survives the artifacts root moving or being read from another machine. */
  rawScreenshotRef?: string;
  renderedScreenshotRef?: string;
  consoleErrorCount?: number;
  axe?: PrescanAxeFacts;
  axeError?: string;
  metrics?: PrescanPageMetrics;
  metricsError?: string;
  /** Present on every page, since a booking widget can sit anywhere. */
  bookingEvidence?: TransactionalFlowEvidence[];
  bookingEvidenceError?: string;
  /** Set when the page could not be loaded or was disallowed. The result
   *  still lists the page, so "we could not read the booking page" is
   *  distinguishable from "this hotel has no booking page". */
  error?: string;
  skippedByRobots?: boolean;
  durationMs: number;
}

export interface PrescanResult {
  startUrl: string;
  status: PrescanStatus;
  pages: PrescanPageResult[];
  absentRoles: PrescanRoleAbsence[];
  offsiteBookingLinks: string[];
  robotsTxtFound: boolean;
  effectiveDelayMs: number;
  /** The prescan directory these artifacts were written under, relative to
   *  the prescans root. */
  artifactsDir: string;
  startedAt: string;
  durationMs: number;
  /** Self-reported by the browser that actually ran, matching the manifest's
   *  own rule that a recorded tool version is what ran rather than what is
   *  installed. */
  browserVersion: string;
  evidence: HotelPrescanEvidence;
}

export interface PrescanSiteOptions {
  browser: Browser;
  /** Directory this prescan's screenshots are written under. */
  artifactsDir: string;
  delayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  settleTimeoutMs?: number;
  onProgress?: (event: PrescanProgressEvent) => void;
}

export type PrescanProgressEvent =
  | { type: 'prescan-start'; startUrl: string; effectiveDelayMs: number }
  | { type: 'prescan-page'; role: PrescanPageRole; url: string; index: number; total: number };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeAxe(results: AxeResults): PrescanAxeFacts {
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const ruleIds = new Set<string>();
  let affectedElementCount = 0;

  for (const violation of results.violations) {
    ruleIds.add(violation.id);
    affectedElementCount += violation.nodes.length;
    const impact = violation.impact;
    if (
      impact === 'critical' ||
      impact === 'serious' ||
      impact === 'moderate' ||
      impact === 'minor'
    )
      byImpact[impact] += violation.nodes.length;
  }

  return {
    violationCount: results.violations.length,
    byImpact,
    ruleIds: [...ruleIds].sort(),
    affectedElementCount,
  };
}

/** Anchors as page-roles.ts wants them. Text rather than innerText so an
 *  aria-label-only or image link still offers something to match on. */
async function extractAnchors(page: Page): Promise<AnchorLike[]> {
  return page.$$eval('a[href]', (elements) =>
    elements.map((element) => ({
      href: element.getAttribute('href') ?? '',
      text: [
        element.textContent ?? '',
        element.getAttribute('aria-label') ?? '',
        element.getAttribute('title') ?? '',
      ]
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    })),
  );
}

interface LoadedPageOutcome {
  result: PrescanPageResult;
  anchors: AnchorLike[];
  facts: HotelEvidenceFact[];
  failureCapture: CapturedFailureCandidate | null;
  headMetadata: HeadMetadataExtraction | null;
}

function isBookingCallToAction(
  selector: string,
  snippet: string,
  bookingEvidence: readonly TransactionalFlowEvidence[],
): boolean {
  if (/r[ée]serv|\bbook(ing)?\b|disponibilit|availab/i.test(snippet)) return true;
  return bookingEvidence.some(
    (evidence) => selector.startsWith(evidence.selector) || evidence.selector.startsWith(selector),
  );
}

/**
 * Loads and measures one page. Every observation is independently fallible
 * for the reason PageScanResult states about the full audit: an axe failure
 * on one page must not lose the render diff and the metrics already gathered
 * from the same navigation.
 */
async function prescanOnePage(
  role: PrescanPageRole,
  url: string,
  robots: RobotsRules,
  options: {
    browser: Browser;
    artifactsDir: string;
    timeoutMs: number;
    userAgent: string;
    settleTimeoutMs: number;
    delayMs: number;
    collectAnchors: boolean;
  },
): Promise<LoadedPageOutcome> {
  const startedAt = Date.now();

  if (!isAllowedByRobots(robots, new URL(url).pathname)) {
    return {
      result: { role, url, skippedByRobots: true, durationMs: Date.now() - startedAt },
      anchors: [],
      facts: [],
      failureCapture: null,
      headMetadata: null,
    };
  }

  let axe: PrescanAxeFacts | undefined;
  let axeError: string | undefined;
  let metrics: PrescanPageMetrics | undefined;
  let metricsError: string | undefined;
  let bookingEvidence: TransactionalFlowEvidence[] | undefined;
  let bookingEvidenceError: string | undefined;
  let anchors: AnchorLike[] = [];
  const facts: HotelEvidenceFact[] = [];
  let failureCapture: CapturedFailureCandidate | null = null;
  let headMetadata: HeadMetadataExtraction | null = null;

  let requestTotals: (() => ReturnType<ReturnType<typeof recordPageRequests>>) | undefined;
  let navigationStartedAt = startedAt;

  try {
    const diff = await renderDiff(options.browser, url, {
      screenshotDir: options.artifactsDir,
      timeoutMs: options.timeoutMs,
      userAgent: options.userAgent,
      settleTimeoutMs: options.settleTimeoutMs,
      // The delay is applied between the raw and rendered passes on this
      // page too, not only between pages: non-negotiable rule 5 counts
      // scanner passes, not just crawl requests.
      preRenderedDelayMs: options.delayMs,
      onRenderedPageCreated: async (page) => {
        navigationStartedAt = Date.now();
        requestTotals = recordPageRequests(page, url);
      },
      onRenderedPage: async (page) => {
        // Ordered cheapest-first over one navigation. Each is guarded
        // separately so one failure costs only its own result.
        try {
          metrics = await measurePageMetrics(page, {
            requestTotals: requestTotals ?? (() => emptyTotals()),
            navigationStartedAt,
          });
        } catch (error) {
          metricsError = messageOf(error);
        }
        try {
          bookingEvidence = await detectTransactionalFlow(page, url);
        } catch (error) {
          bookingEvidenceError = messageOf(error);
        }
        if (options.collectAnchors) {
          try {
            anchors = await extractAnchors(page);
          } catch {
            anchors = [];
          }
        }
        try {
          headMetadata = await extractHeadMetadata(page, url);
        } catch {
          headMetadata = null;
        }
        try {
          const axeResults = await runAxe(page);
          axe = summarizeAxe(axeResults);
          const axeFacts = extractAxeCandidates(axeResults, url).map((candidate) =>
            toHotelEvidenceFact(
              candidate,
              role,
              candidate.element !== null &&
                role === 'booking' &&
                isBookingCallToAction(
                  candidate.element.selector,
                  candidate.element.snippet,
                  bookingEvidence ?? [],
                ),
            ),
          );
          facts.push(...axeFacts);
          failureCapture = await captureFirstMeasuredFailure(
            options.browser,
            page,
            rankHotelSpecificFailures(axeFacts),
          );
        } catch (error) {
          axeError = messageOf(error);
        }
        if (role === 'booking') {
          const customFacts: HotelEvidenceFact[] = [];
          try {
            customFacts.push(
              ...extractKeyboardNavigationCandidates(await walkKeyboardNavigation(page, url)).map(
                (candidate) => toHotelEvidenceFact(candidate, role),
              ),
            );
          } catch {
            // An unavailable interactive fact is an omission, not a guessed failure.
          }
          try {
            customFacts.push(
              ...extractFormErrorHandlingCandidates(await checkFormErrorHandling(page, url)).map(
                (candidate) => toHotelEvidenceFact(candidate, role),
              ),
            );
          } catch {
            // Same boundary as the keyboard check: preserve the other facts.
          }
          facts.push(...customFacts);
          // Native constraint-validation bubbles and the current focus are
          // browser UI state, not part of the measured DOM fact. Clear them
          // before capture so identical page state produces identical pixels.
          await page.keyboard.press('Escape').catch(() => undefined);
          await page
            .evaluate(() => {
              if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            })
            .catch(() => undefined);
          await page
            .evaluate(
              () =>
                new Promise<void>((resolve) => {
                  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
                }),
            )
            .catch(() => undefined);
          const customCapture = await captureFirstMeasuredFailure(
            options.browser,
            page,
            rankHotelSpecificFailures(customFacts),
          );
          if (customCapture !== null) failureCapture = customCapture;
        }
      },
    });

    return {
      result: {
        role,
        url,
        httpStatus: diff.httpStatus,
        missingPercent: diff.missingPercent,
        rawTextLength: diff.rawTextLength,
        renderedTextLength: diff.renderedTextLength,
        // Relative to the prescan directory, matching the stored-refs rule
        // in CLAUDE.md's artifacts layout. Absent when render-diff itself
        // did not produce a screenshot.
        ...(diff.rawScreenshotRef !== undefined
          ? { rawScreenshotRef: path.relative(options.artifactsDir, diff.rawScreenshotRef) }
          : {}),
        ...(diff.renderedScreenshotRef !== undefined
          ? {
              renderedScreenshotRef: path.relative(
                options.artifactsDir,
                diff.renderedScreenshotRef,
              ),
            }
          : {}),
        consoleErrorCount: diff.consoleErrors.length,
        ...(axe !== undefined ? { axe } : {}),
        ...(axeError !== undefined ? { axeError } : {}),
        ...(metrics !== undefined ? { metrics } : {}),
        ...(metricsError !== undefined ? { metricsError } : {}),
        ...(bookingEvidence !== undefined ? { bookingEvidence } : {}),
        ...(bookingEvidenceError !== undefined ? { bookingEvidenceError } : {}),
        durationMs: Date.now() - startedAt,
      },
      anchors,
      facts,
      failureCapture,
      headMetadata,
    };
  } catch (error) {
    return {
      result: { role, url, error: messageOf(error), durationMs: Date.now() - startedAt },
      anchors: [],
      facts: [],
      failureCapture: null,
      headMetadata: null,
    };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyTotals(): ReturnType<ReturnType<typeof recordPageRequests>> {
  return {
    requestCount: 0,
    transferBytes: 0,
    thirdPartyRequestCount: 0,
    thirdPartyHosts: [],
    sizeUnavailableCount: 0,
  };
}

export async function prescanSite(
  startUrl: string,
  options: PrescanSiteOptions,
): Promise<PrescanResult> {
  const startedAt = new Date();
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? getPageTimeoutMs() ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent ?? getCrawlerUserAgent();
  const settleTimeoutMs = options.settleTimeoutMs ?? getRenderSettleTimeoutMs();
  const configuredDelayMs = options.delayMs ?? getCrawlDelayMs();
  const origin = new URL(startUrl).origin;

  await fs.mkdir(options.artifactsDir, { recursive: true });

  const robots = await fetchRobotsRules(origin, userAgent, timeoutMs);
  // Stricter of the two, exactly as crawlSite computes it: a site asking for
  // more space than we configured gets it.
  const effectiveDelayMs = Math.max(configuredDelayMs, robots.crawlDelayMs ?? 0);

  const browserVersion = options.browser.version();

  const base = {
    startUrl,
    robotsTxtFound: robots.found,
    effectiveDelayMs,
    artifactsDir: options.artifactsDir,
    startedAt: startedAt.toISOString(),
    browserVersion,
  };

  options.onProgress?.({ type: 'prescan-start', startUrl, effectiveDelayMs });

  async function finalizeEarly(
    status: Exclude<PrescanStatus, 'complete'>,
    pages: LoadedPageOutcome[],
  ): Promise<PrescanResult> {
    const evidence = await buildPrescanEvidence({
      browser: options.browser,
      prescanDir: options.artifactsDir,
      pages,
      startedAt,
    });
    return {
      ...base,
      status,
      pages: pages.map((page) => withoutGenericScreenshotRefs(page.result)),
      absentRoles: [],
      offsiteBookingLinks: [],
      durationMs: Date.now() - started,
      evidence,
    };
  }

  if (!isAllowedByRobots(robots, new URL(startUrl).pathname)) {
    return finalizeEarly('blocked-by-robots', []);
  }

  const pageOptions = {
    browser: options.browser,
    artifactsDir: options.artifactsDir,
    timeoutMs,
    userAgent,
    settleTimeoutMs,
    delayMs: effectiveDelayMs,
  };

  options.onProgress?.({
    type: 'prescan-page',
    role: 'homepage',
    url: startUrl,
    index: 1,
    total: 1,
  });
  const homepage = await prescanOnePage('homepage', startUrl, robots, {
    ...pageOptions,
    collectAnchors: true,
  });

  if (homepage.result.error !== undefined) {
    return finalizeEarly('homepage-unreachable', [homepage]);
  }

  const selection: PrescanPageSelection = selectPrescanPages(startUrl, homepage.anchors);
  const furtherPages = selection.selected.filter((page) => page.role !== 'homepage');
  const outcomes: LoadedPageOutcome[] = [homepage];

  for (const [index, page] of furtherPages.entries()) {
    await sleep(effectiveDelayMs);
    options.onProgress?.({
      type: 'prescan-page',
      role: page.role,
      url: page.url,
      index: index + 2,
      total: furtherPages.length + 1,
    });
    const outcome = await prescanOnePage(page.role, page.url, robots, {
      ...pageOptions,
      collectAnchors: false,
    });
    outcomes.push(outcome);
  }

  const geoCandidates = extractGeoCandidates(
    outcomes.flatMap((outcome) => {
      const metadata = outcome.headMetadata;
      if (metadata === null) return [];
      const parsed = metadata.jsonLdBlocks
        .map((block) => block.parsed)
        .filter((value): value is object => value !== null && typeof value === 'object');
      const types = parsed.flatMap(readJsonLdTypes);
      return [
        {
          pageUrl: outcome.result.url,
          jsonLdTypes: types,
          jsonLdEntities: parsed.map((value) => ({ parsed: value })),
          questionHeadingCount: metadata.headings.filter((heading) => /\?\s*$/.test(heading.text))
            .length,
          hasFaqSchema: types.some((type) => type === 'FAQPage' || type === 'QAPage'),
        },
      ];
    }),
    startUrl,
  );
  for (const candidate of geoCandidates) {
    const outcome = outcomes.find((page) => page.result.url === candidate.pageUrl) ?? homepage;
    outcome.facts.push(toHotelEvidenceFact(candidate, outcome.result.role));
  }
  for (const outcome of outcomes) {
    const page = outcome.result;
    if (
      page.missingPercent !== undefined &&
      page.rawTextLength !== undefined &&
      page.renderedTextLength !== undefined
    ) {
      outcome.facts.push({
        source: 'renderdiff',
        ruleId: 'text-missing-from-raw-html',
        severity: 'moderate',
        wcagCriteria: [],
        pageRole: page.role,
        pageUrl: page.url,
        missingPercent: page.missingPercent,
        rawTextLength: page.rawTextLength,
        renderedTextLength: page.renderedTextLength,
      });
    }
  }
  const evidencePages: PrescanEvidencePage[] = outcomes;
  const evidence = await buildPrescanEvidence({
    browser: options.browser,
    prescanDir: options.artifactsDir,
    pages: evidencePages,
    startedAt,
  });

  return {
    ...base,
    status: 'complete',
    pages: outcomes.map((outcome) => withoutGenericScreenshotRefs(outcome.result)),
    absentRoles: selection.absent,
    offsiteBookingLinks: selection.offsiteBookingLinks,
    durationMs: Date.now() - started,
    evidence,
  };
}

function withoutGenericScreenshotRefs(page: PrescanPageResult): PrescanPageResult {
  const { rawScreenshotRef: _raw, renderedScreenshotRef: _rendered, ...retained } = page;
  return retained;
}
