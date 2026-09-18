/**
 * The mobile surface runner (plan 059 sections 5.5, 9 and correction 3.8).
 *
 * One extra rendered pass per page in a phone-class viewport, sharing the
 * run's single host scheduler like every other request (decision 18 — no
 * hidden second lane), in a storage-fresh context, under the published
 * crawler user agent. The pass exists because a mobile viewport is a
 * different rendering of the same page: lazy layouts, reflow defects and
 * mobile-only DOM can appear only there. It does not exist to negotiate a
 * server-side mobile variant — the identity assertion in
 * `mobileSurface()` refuses the pass entirely before any navigation if the
 * run's user agent ever differs from the published one, and the UA the page
 * itself observes is verified after load (`navigator.userAgent`), so the
 * identity claim on the surface record is an observed fact, not an
 * intention.
 */
import type { Browser, Page, Response } from 'playwright';
import { getCrawlerUserAgent, getRenderSettleTimeoutMs } from './config.js';
import { runAxe, type AxeResults } from './axe.js';
import {
  MOBILE_SURFACE_PROFILE,
  mobileSurface,
  type ScanSurface,
  type SurfaceReadinessOutcome,
} from './evidence-surfaces.js';
import type { PageWorkGuard } from './page-work-guard.js';
import {
  observeRenderedReadiness,
  watchSignificantResourceFailures,
  type RenderedReadinessObservation,
} from './page-readiness.js';
import { collectSurfaceLinks } from './surface-discovery.js';
import {
  installBrowserNetworkSafety,
  type NetworkSafetyBlockHandler,
} from './browser-network-safety.js';
import type { NetworkTargetPolicy } from './network-target-policy.js';

/** Bounded, secret-minimizing summary of one axe run on the surface:
 *  rule id, native impact and how many nodes matched — never the node
 *  snippets, which belong to the page's accepted baseline evidence. */
export interface SurfaceAxeViolationSummary {
  ruleId: string;
  impact: string | null;
  nodeCount: number;
}

export function summarizeAxeViolations(axe: AxeResults): SurfaceAxeViolationSummary[] {
  return axe.violations
    .map((violation) => ({
      ruleId: violation.id,
      impact: violation.impact ?? null,
      nodeCount: violation.nodes.length,
    }))
    .sort((left, right) => left.ruleId.localeCompare(right.ruleId));
}

/** One page's mobile surface: what ran, how ready the page was, what axe
 *  saw, and whether the crawler identity survived on the wire. */
export interface MobileSurfaceRecord {
  surface: ScanSurface;
  readiness: RenderedReadinessObservation;
  axeViolations: SurfaceAxeViolationSummary[];
  /** Axe could not run on this surface; a recorded gap, never a pass. */
  axeError?: string;
  /** The page-visible user agent matched the published crawler identity. */
  uaVerified: boolean;
  /** Same-origin anchors read off the settled mobile page, normalized and
   *  ready for inventory discovery under this surface's provenance. */
  links: string[];
}

export interface MobileSurfaceOptions {
  evidenceEpoch: number;
  /** The user agent this run puts on the wire everywhere else. Must equal
   *  the published crawler identity or the pass refuses to run. */
  userAgent?: string;
  timeoutMs?: number;
  /** Plan 059: paces the mobile navigation against the run's shared
   *  scheduler (`pace()`, not `schedule()` — the caller's lane context
   *  varies, and only one pacer may apply to one request). */
  beforeNavigation?: () => Promise<void>;
  guard?: PageWorkGuard;
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: NetworkSafetyBlockHandler;
  /** Injectable for offline tests; production always runs axe-core. */
  axeAnalyze?: (page: Page) => Promise<AxeResults>;
  exclusionPatterns?: readonly string[];
}

export async function runMobileSurfaceAnalysis(
  browser: Browser,
  url: string,
  options: MobileSurfaceOptions,
): Promise<MobileSurfaceRecord> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const settleTimeoutMs = getRenderSettleTimeoutMs();
  const userAgent = options.userAgent ?? getCrawlerUserAgent();
  // Identity first: this throws before any navigation when the run's user
  // agent is not the published one, so the mobile surface can never become
  // a UA-impersonation lane.
  const surface = mobileSurface({
    evidenceEpoch: options.evidenceEpoch,
    pageIdentity: url,
    userAgent,
    crawlerUserAgent: getCrawlerUserAgent(),
    readinessOutcome: 'ready',
  });

  const context = await browser.newContext({
    userAgent,
    viewport: { ...MOBILE_SURFACE_PROFILE.viewport },
    deviceScaleFactor: MOBILE_SURFACE_PROFILE.deviceScaleFactor,
    hasTouch: MOBILE_SURFACE_PROFILE.hasTouch,
    colorScheme: MOBILE_SURFACE_PROFILE.media.colorScheme,
    reducedMotion: MOBILE_SURFACE_PROFILE.media.reducedMotion,
  });
  if (options.networkPolicy !== undefined) {
    await installBrowserNetworkSafety(
      context,
      options.networkPolicy,
      options.onNetworkSafetyBlocked,
    );
  }
  options.guard?.track(context);
  try {
    context.setDefaultTimeout(timeoutMs);
    context.setDefaultNavigationTimeout(timeoutMs);
    const page = await context.newPage();
    const readFailures = watchSignificantResourceFailures(page);
    await options.beforeNavigation?.();
    const response: Response | null = await page.goto(url, { waitUntil: 'load' });
    let networkQuiet = true;
    try {
      await page.waitForLoadState('networkidle', { timeout: settleTimeoutMs });
    } catch {
      networkQuiet = false;
    }
    const readiness = await observeRenderedReadiness(page, {
      response,
      networkQuiet,
      readFailures,
    });
    // The wire-level identity check: Chromium applies the context's UA
    // override verbatim, so what the page observes is what the site saw.
    const observedUserAgent = await page.evaluate(() => navigator.userAgent);
    const uaVerified = observedUserAgent === userAgent;
    let axeViolations: SurfaceAxeViolationSummary[] = [];
    let axeError: string | undefined;
    try {
      axeViolations = summarizeAxeViolations(await (options.axeAnalyze ?? runAxe)(page));
    } catch (error) {
      axeError = error instanceof Error ? error.message : String(error);
    }
    const surfaceLinks = await collectSurfaceLinks(page, {
      baseUrl: page.url(),
      ...(options.exclusionPatterns !== undefined
        ? { exclusionPatterns: options.exclusionPatterns }
        : {}),
    }).catch(() => []);

    return {
      surface: {
        ...surface,
        readinessOutcome: readinessOutcomeFor(readiness.outcome, uaVerified),
      },
      readiness,
      axeViolations,
      ...(axeError !== undefined ? { axeError } : {}),
      uaVerified,
      links: surfaceLinks,
    };
  } finally {
    options.guard?.untrack(context);
    await context.close();
  }
}

/** A surface whose observed identity cannot be proven is not a ready
 *  surface: the record survives (so the gap is visible) but reads as
 *  blocked rather than ready. */
function readinessOutcomeFor(
  outcome: SurfaceReadinessOutcome,
  uaVerified: boolean,
): SurfaceReadinessOutcome {
  return uaVerified ? outcome : 'blocked';
}
