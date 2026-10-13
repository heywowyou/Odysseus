/**
 * C3 (2026-08-24): WCAG 1.4.10 Reflow, measured rather than assumed.
 *
 * Every report this product ships states that automated tools cover
 * roughly 30 to 40 percent of the accessibility criteria. Reflow is one
 * of the criteria in the missing majority that a browser can actually
 * decide, because the failure is mechanical and observable: at a 320 CSS
 * pixel viewport, content that requires horizontal scrolling to read
 * fails. axe-core does not test it, because axe audits the DOM at
 * whatever viewport it is handed and never resizes.
 *
 * The criterion's own threshold is the reason 320px is used and not a
 * rounder number: WCAG 1.4.10 is written as "320 CSS pixels wide", which
 * corresponds to a 1280px viewport at 400% zoom.
 *
 * Two measurements, both mechanical:
 *
 *   - Does the document scroll horizontally at 320px? A page whose
 *     scrollWidth exceeds its clientWidth forces the two-directional
 *     scrolling the criterion exists to prevent.
 *   - Which elements are individually wider than the viewport? Reported
 *     with real selectors, because "the page scrolls sideways" is not
 *     actionable on its own and the usual cause is one fixed-width table,
 *     image or embed rather than the layout as a whole.
 *
 * A small tolerance is applied. Sub-pixel layout rounding and a scrollbar
 * gutter routinely produce a one- or two-pixel overflow that no user can
 * perceive and no developer can remove, and reporting those would bury
 * the real failures.
 *
 * A page that hides its horizontal overflow (`overflow-x: hidden` or
 * `clip` on the root or the body) cannot be scrolled sideways, so it is not
 * reported here: what it cuts off is content loss, which the capability
 * registry leaves to the manual review.
 *
 * Runs on the already-loaded rendered page inside the existing
 * onRenderedPage hook: one viewport resize, no extra navigation, no
 * network. The viewport is restored afterwards so no later check in the
 * same hook sees a page this one reshaped.
 */

import type { Page } from 'playwright';

/** WCAG 1.4.10's own stated width. */
export const REFLOW_VIEWPORT_WIDTH = 320;
const REFLOW_VIEWPORT_HEIGHT = 640;

/** Sub-pixel rounding and scrollbar gutters produce overflows of a pixel
 *  or two on layouts that are in fact correct. Chosen to sit above that
 *  noise and well below anything a reader would notice. */
const OVERFLOW_TOLERANCE_PX = 4;

/** How long a page that overflows is given to finish laying itself out
 *  before the overflow is taken as its settled state. Embedded widgets size
 *  themselves in script and react to a resize after their own delay: an
 *  Instagram feed measured 150 ms after the resize was still as wide as the
 *  desktop layout on a page that fits at 320 (roches-blanches-cassis.com).
 *  Only a page that overflows pays this wait. */
const SETTLE_TIMEOUT_MS = 2_000;
const SETTLE_POLL_MS = 250;

/** More than this many offending elements almost always means one
 *  container overflowing and every descendant inheriting the width;
 *  listing them all would be dozens of selectors describing one defect. */
const MAX_REPORTED_ELEMENTS = 5;

export interface ReflowOverflowElement {
  selector: string;
  widthPx: number;
  snippet: string;
}

export interface ReflowCheckResult {
  pageUrl: string;
  checked: boolean;
  /** Horizontal scrolling required to read the content at 320px. */
  requiresHorizontalScroll: boolean;
  documentScrollWidthPx: number;
  viewportWidthPx: number;
  /** The widest offending elements, outermost first. */
  overflowElements: ReflowOverflowElement[];
  checkError?: string;
}

export async function checkReflow(
  page: Page,
  pageUrl: string,
  signal?: AbortSignal,
): Promise<ReflowCheckResult> {
  if (signal?.aborted) throw new Error('reflow aborted');
  const originalViewport = page.viewportSize();
  try {
    await page.setViewportSize({ width: REFLOW_VIEWPORT_WIDTH, height: REFLOW_VIEWPORT_HEIGHT });
    // Give the layout a chance to settle: a responsive site's media
    // queries and any resize listeners run asynchronously.
    await page.waitForTimeout(150);
    if (signal?.aborted) throw new Error('reflow aborted');

    const measure = () =>
      page.evaluate(
        ({ tolerance, maxElements }) => {
          const cssPath = (el: Element): string => {
            const parts: string[] = [];
            let current: Element | null = el;
            while (current && current !== document.documentElement) {
              if (current.id) {
                parts.unshift(`#${CSS.escape(current.id)}`);
                break;
              }
              const parent: Element | null = current.parentElement;
              if (!parent) break;
              const index = Array.from(parent.children).indexOf(current) + 1;
              parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
              current = parent;
            }
            return parts.join(' > ');
          };

          const viewportWidth = document.documentElement.clientWidth;
          const scrollWidth = Math.max(
            document.documentElement.scrollWidth,
            document.body?.scrollWidth ?? 0,
          );

          const offenders: { selector: string; widthPx: number; snippet: string; depth: number }[] =
            [];
          for (const el of Array.from(document.body?.querySelectorAll('*') ?? [])) {
            const rect = el.getBoundingClientRect();
            if (rect.width <= viewportWidth + tolerance) continue;
            // A hidden element cannot force a scrollbar the reader
            // experiences, and offscreen menus are routinely wide.
            const style = getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden') continue;

            let depth = 0;
            for (let node: Element | null = el; node; node = node.parentElement) depth += 1;
            offenders.push({
              selector: cssPath(el),
              widthPx: Math.round(rect.width),
              snippet: el.outerHTML.slice(0, 200),
              depth,
            });
          }

          // Outermost first: the shallowest offender is the container
          // actually setting the width, and the one worth fixing.
          offenders.sort((a, b) => a.depth - b.depth || b.widthPx - a.widthPx);

          // The viewport scrolls as the root element says, or as the body
          // says when the root leaves its overflow visible. A page that
          // hides or clips it cannot be scrolled sideways, whatever its
          // scroll width: the two-directional scrolling this check proves
          // is absent, and content it may cut off is the manual
          // content-loss check, not this one.
          const rootOverflowX = getComputedStyle(document.documentElement).overflowX;
          const viewportOverflowX =
            rootOverflowX !== 'visible' || document.body === null
              ? rootOverflowX
              : getComputedStyle(document.body).overflowX;
          const scrollsSideways = viewportOverflowX !== 'hidden' && viewportOverflowX !== 'clip';

          return {
            viewportWidth,
            scrollWidth,
            requiresHorizontalScroll: scrollsSideways && scrollWidth > viewportWidth + tolerance,
            overflowElements: offenders
              .slice(0, maxElements)
              .map(({ selector, widthPx, snippet }) => ({
                selector,
                widthPx,
                snippet,
              })),
          };
        },
        { tolerance: OVERFLOW_TOLERANCE_PX, maxElements: MAX_REPORTED_ELEMENTS },
      );

    let measurement = await measure();
    if (measurement.requiresHorizontalScroll) {
      const deadline = Date.now() + SETTLE_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await page.waitForTimeout(SETTLE_POLL_MS);
        if (signal?.aborted) throw new Error('reflow aborted');
        const stillOverflows = await page.evaluate(
          (tolerance) =>
            Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0) >
            document.documentElement.clientWidth + tolerance,
          OVERFLOW_TOLERANCE_PX,
        );
        if (!stillOverflows) break;
      }
      measurement = await measure();
    }

    return {
      pageUrl,
      checked: true,
      requiresHorizontalScroll: measurement.requiresHorizontalScroll,
      documentScrollWidthPx: measurement.scrollWidth,
      viewportWidthPx: measurement.viewportWidth,
      overflowElements: measurement.overflowElements,
    };
  } catch (error) {
    return {
      pageUrl,
      checked: false,
      requiresHorizontalScroll: false,
      documentScrollWidthPx: 0,
      viewportWidthPx: REFLOW_VIEWPORT_WIDTH,
      overflowElements: [],
      checkError: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // Restore, so no check running later in the same hook sees a page
    // this one reshaped.
    if (originalViewport) await page.setViewportSize(originalViewport).catch(() => undefined);
  }
}
