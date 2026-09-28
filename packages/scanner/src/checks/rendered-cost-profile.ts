/**
 * Rendered-cost facts for the full-audit Lighthouse tie-break (plan 021,
 * `full-audit-plan.ts`'s `RenderedCostProfile`). This measures relative
 * weight only, to break a tie among pages sharing one template family and
 * language, using the exact tuple `(resourceCount, imageCount,
 * domNodeCount, knownTransferBytes, unknownTransferSizeCount)`
 * `full-audit-plan.ts` compares. It is not a performance finding.
 *
 * Deliberately narrower than the hotel prescan's `page-metrics.ts` (no
 * LCP/CLS/long-task observers): that module measures performance for a
 * finding, this module only ranks pages within a family, and the two stay
 * independent per `docs/decisions/trade-offs.md` entry 35.
 */

import type { Page } from 'playwright';

export interface RenderedResourceTotals {
  resourceCount: number;
  knownTransferBytes: number;
  unknownTransferSizeCount: number;
}

/**
 * Starts counting responses. Must be called before navigation (via
 * render-diff's `onRenderedPageCreated` hook) - a listener attached
 * afterwards misses the document and everything the initial parse
 * requested, which is most of a page's weight.
 *
 * Returns an async snapshot function that waits, briefly, for in-flight
 * size lookups before reporting totals; a lookup still pending then is
 * counted as an unknown size, never silently dropped.
 */
/** How long a snapshot waits for size lookups still in flight. Plan 075
 *  K2: a response that never completes (a stream, a long poll) kept its
 *  `sizes()` pending, the snapshot waited out its whole check budget on
 *  every page of clos-sainte-marie, and the page analysis was abandoned
 *  with it. A lookup still pending after this counts as an unknown size. */
const RESOURCE_SIZE_SETTLE_MS = 1_500;

export function recordRenderedResourceTotals(
  page: Page,
  settleMs: number = RESOURCE_SIZE_SETTLE_MS,
): () => Promise<RenderedResourceTotals> {
  let resourceCount = 0;
  let knownTransferBytes = 0;
  let unknownTransferSizeCount = 0;
  const pending = new Set<Promise<void>>();

  page.on('response', (response) => {
    resourceCount += 1;
    const lookup: Promise<void> = response
      .request()
      .sizes()
      .then((sizes) => {
        knownTransferBytes += sizes.responseBodySize + sizes.responseHeadersSize;
      })
      .catch(() => {
        unknownTransferSizeCount += 1;
      })
      .finally(() => {
        pending.delete(lookup);
      });
    pending.add(lookup);
  });

  return async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([...pending]),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, settleMs);
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
    return {
      resourceCount,
      knownTransferBytes,
      unknownTransferSizeCount: unknownTransferSizeCount + pending.size,
    };
  };
}

export interface RenderedDomCostFacts {
  domNodeCount: number;
  imageCount: number;
}

export async function extractRenderedDomCostFacts(page: Page): Promise<RenderedDomCostFacts> {
  return page.evaluate(() => ({
    domNodeCount: document.querySelectorAll('*').length,
    imageCount: document.querySelectorAll('img').length,
  }));
}
