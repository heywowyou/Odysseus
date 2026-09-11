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

export async function checkReflow(page: Page, pageUrl: string): Promise<ReflowCheckResult> {
  const originalViewport = page.viewportSize();
  try {
    await page.setViewportSize({ width: REFLOW_VIEWPORT_WIDTH, height: REFLOW_VIEWPORT_HEIGHT });
    // Give the layout a chance to settle: a responsive site's media
    // queries and any resize listeners run asynchronously.
    await page.waitForTimeout(150);

    const measurement = await page.evaluate(
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

        return {
          viewportWidth,
          scrollWidth,
          requiresHorizontalScroll: scrollWidth > viewportWidth + tolerance,
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
