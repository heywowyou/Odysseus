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
 * Returns an async snapshot function that awaits every in-flight size
 * lookup before reporting totals, so a response whose `sizes()` promise is
 * still pending when the caller reads the snapshot is never silently
 * undercounted.
 */
export function recordRenderedResourceTotals(page: Page): () => Promise<RenderedResourceTotals> {
  let resourceCount = 0;
  let knownTransferBytes = 0;
  let unknownTransferSizeCount = 0;
  const pending: Promise<void>[] = [];

  page.on('response', (response) => {
    resourceCount += 1;
    pending.push(
      response
        .request()
        .sizes()
        .then((sizes) => {
          knownTransferBytes += sizes.responseBodySize + sizes.responseHeadersSize;
        })
        .catch(() => {
          unknownTransferSizeCount += 1;
        }),
    );
  });

  return async () => {
    await Promise.allSettled(pending);
    return { resourceCount, knownTransferBytes, unknownTransferSizeCount };
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
