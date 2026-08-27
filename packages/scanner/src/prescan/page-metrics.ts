/**
 * Direct page measurement for the prescan (milestone 9c plan 004, step 3).
 * Lighthouse is never invoked here: it is the prospecting pipeline's
 * serialisation bottleneck (trade-off 10) and it costs an extra full
 * navigation per page, which is most of the prescan's whole time budget.
 *
 * Everything below was verified against known input before being written,
 * because a performance observer that silently never fires reports zero and
 * zero looks exactly like a fast page. Measured 2026-08-27 against a page
 * with a deliberate 300ms plus 200ms main-thread block: the observer
 * reported 400ms, which is 500ms minus the two 50ms long-task thresholds.
 *
 * Two facts about the numbers, both of which downstream scoring must respect:
 *
 * - **Only LCP varies between runs of an unchanged page** (140-260ms across
 *   five runs of the local fixture). CLS, transfer bytes, and request counts
 *   were byte-identical. LCP is therefore the one metric a later score must
 *   not treat as exact.
 * - **The observation window is part of the measurement.** CLS and long tasks
 *   accrue for as long as the page is open, so two prescans that waited
 *   different lengths of time are not comparable. The window is bounded by
 *   the caller's settle wait and recorded on the result rather than left
 *   implicit.
 *
 * Bytes come from Playwright's own response sizes, not from the Resource
 * Timing API. Measured on the same spike: a cross-origin image reported
 * `transferSize: 0` through Resource Timing, because a third party that does
 * not send Timing-Allow-Origin is invisible to it. On a real hotel site,
 * whose weight is largely third-party fonts, tag managers, and CDN images,
 * that undercount would fall precisely on the bytes worth reporting.
 */

import type { Page } from 'playwright';
import { isSameSiteHostname } from '../links.js';

/** How long the buffered observers are given to deliver replayed entries
 *  before they are read. The observer callback is queued as a task, so
 *  reading synchronously after `observe()` returns nothing at all. */
const OBSERVER_FLUSH_MS = 250;

/** The long-task threshold the Long Tasks API itself defines. Blocking time
 *  is the excess over it, which is the part a user actually waits through. */
const LONG_TASK_THRESHOLD_MS = 50;

export interface PrescanRequestTotals {
  requestCount: number;
  /** Response bodies plus response headers, over every response received. */
  transferBytes: number;
  thirdPartyRequestCount: number;
  /** Distinct third-party hostnames, sorted, so two runs of an unchanged
   *  page produce an identical list. */
  thirdPartyHosts: string[];
  /** Responses whose size Playwright could not report (a redirect chain
   *  entry, or a request aborted mid-flight). Surfaced rather than silently
   *  folded into the byte total as zero. */
  sizeUnavailableCount: number;
}

export interface PrescanPageMetrics extends PrescanRequestTotals {
  /** Milliseconds from navigation start. Null when the observer reported no
   *  entry, which happens on a page with no contentful element. */
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number | null;
  longTaskCount: number | null;
  /** Sum of each long task's duration beyond the 50ms threshold. */
  mainThreadBlockingMs: number | null;
  /** Milliseconds from navigation to the moment these were read. The window
   *  CLS and long tasks accrued over; see the header. */
  observationWindowMs: number;
  /** Per-metric failures, kept rather than thrown: a browser that does not
   *  support one entry type must not lose the other five metrics. */
  failures: string[];
}

/**
 * Starts counting responses. **Must be called before navigation** - a
 * listener attached afterwards misses the document and everything the
 * initial parse requested, which is most of a page's weight.
 *
 * Sizes are read inside the event handler rather than at snapshot time
 * because Playwright discards a request's sizing data once its page is
 * closed, and the prescan closes contexts eagerly.
 */
export function recordPageRequests(page: Page, pageUrl: string): () => PrescanRequestTotals {
  let requestCount = 0;
  let transferBytes = 0;
  let thirdPartyRequestCount = 0;
  let sizeUnavailableCount = 0;
  const thirdPartyHosts = new Set<string>();

  let pageHostname: string;
  try {
    pageHostname = new URL(pageUrl).hostname;
  } catch {
    pageHostname = '';
  }

  const pending: Promise<void>[] = [];

  page.on('response', (response) => {
    requestCount += 1;

    let hostname: string | null;
    try {
      hostname = new URL(response.url()).hostname;
    } catch {
      hostname = null;
    }
    // Same narrow www/apex identity the crawler uses, so a site serving its
    // own images from its apex while the page is on www is not reported as
    // depending on a third party.
    if (hostname !== null && pageHostname !== '' && !isSameSiteHostname(pageHostname, hostname)) {
      thirdPartyRequestCount += 1;
      thirdPartyHosts.add(hostname);
    }

    pending.push(
      response
        .request()
        .sizes()
        .then((sizes) => {
          transferBytes += sizes.responseBodySize + sizes.responseHeadersSize;
        })
        .catch(() => {
          sizeUnavailableCount += 1;
        }),
    );
  });

  return () => ({
    requestCount,
    transferBytes,
    thirdPartyRequestCount,
    thirdPartyHosts: [...thirdPartyHosts].sort(),
    sizeUnavailableCount,
  });
}

interface ObservedTimings {
  largestContentfulPaintMs: number | null;
  cumulativeLayoutShift: number | null;
  longTaskCount: number | null;
  mainThreadBlockingMs: number | null;
  failures: string[];
}

/**
 * Reads the buffered performance entries from an already-loaded page. This
 * works after navigation because every observer is registered with
 * `buffered: true`, which replays entries recorded before it existed -
 * verified against the pre-navigation numbers for the same page, which it
 * reproduced exactly. Registering post-load is what lets the prescan reuse
 * render-diff's single navigation instead of loading each page twice.
 */
async function readObservedTimings(page: Page, flushMs: number): Promise<ObservedTimings> {
  return page.evaluate(
    async ({ flush, threshold }) => {
      interface RawEntry {
        startTime: number;
        duration: number;
        value?: number;
        hadRecentInput?: boolean;
      }

      const collect = (type: string): Promise<{ entries: RawEntry[]; error?: string }> =>
        new Promise((resolve) => {
          const entries: RawEntry[] = [];
          try {
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                const shift = entry as PerformanceEntry & {
                  value?: number;
                  hadRecentInput?: boolean;
                };
                entries.push({
                  startTime: entry.startTime,
                  duration: entry.duration,
                  ...(shift.value !== undefined ? { value: shift.value } : {}),
                  ...(shift.hadRecentInput !== undefined
                    ? { hadRecentInput: shift.hadRecentInput }
                    : {}),
                });
              }
            });
            observer.observe({ type, buffered: true });
            setTimeout(() => {
              observer.disconnect();
              resolve({ entries });
            }, flush);
          } catch (error) {
            resolve({ entries: [], error: String(error) });
          }
        });

      const [lcp, shifts, longTasks] = await Promise.all([
        collect('largest-contentful-paint'),
        collect('layout-shift'),
        collect('longtask'),
      ]);

      const failures: string[] = [];
      if (lcp.error !== undefined) failures.push(`largest-contentful-paint: ${lcp.error}`);
      if (shifts.error !== undefined) failures.push(`layout-shift: ${shifts.error}`);
      if (longTasks.error !== undefined) failures.push(`longtask: ${longTasks.error}`);

      return {
        // The last LCP entry wins: the spec emits a new one each time a
        // larger element paints, and the final one is the metric.
        largestContentfulPaintMs:
          lcp.error === undefined ? (lcp.entries.at(-1)?.startTime ?? null) : null,
        // Shifts following user input are excluded per the CLS definition.
        // A prescan never interacts with the page, so this should exclude
        // nothing; it is applied anyway so the number means CLS.
        cumulativeLayoutShift:
          shifts.error === undefined
            ? shifts.entries
                .filter((entry) => entry.hadRecentInput !== true)
                .reduce((total, entry) => total + (entry.value ?? 0), 0)
            : null,
        longTaskCount: longTasks.error === undefined ? longTasks.entries.length : null,
        mainThreadBlockingMs:
          longTasks.error === undefined
            ? longTasks.entries.reduce(
                (total, entry) => total + Math.max(0, entry.duration - threshold),
                0,
              )
            : null,
        failures,
      };
    },
    { flush: flushMs, threshold: LONG_TASK_THRESHOLD_MS },
  );
}

export interface MeasurePageMetricsOptions {
  /** The snapshot function returned by recordPageRequests. */
  requestTotals: () => PrescanRequestTotals;
  /** When the navigation for this page began, for the observation window. */
  navigationStartedAt: number;
  observerFlushMs?: number;
}

/** Reads every metric for one already-loaded page. Never throws: a failure
 *  to measure one page's performance must not lose the axe results gathered
 *  from the same navigation. */
export async function measurePageMetrics(
  page: Page,
  options: MeasurePageMetricsOptions,
): Promise<PrescanPageMetrics> {
  const flushMs = options.observerFlushMs ?? OBSERVER_FLUSH_MS;

  let timings: ObservedTimings;
  try {
    timings = await readObservedTimings(page, flushMs);
  } catch (error) {
    timings = {
      largestContentfulPaintMs: null,
      cumulativeLayoutShift: null,
      longTaskCount: null,
      mainThreadBlockingMs: null,
      failures: [
        `performance observers: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  return {
    ...timings,
    ...options.requestTotals(),
    observationWindowMs: Date.now() - options.navigationStartedAt,
  };
}
