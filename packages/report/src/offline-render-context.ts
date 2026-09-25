/**
 * Issue #487: the PDF renders run JavaScript (Paged.js is injected) in a
 * Chromium that sits next to every production secret without a sandbox
 * (trade-off 92). The report HTML is self-contained, CSS and fonts inlined as
 * data URIs, and every site-controlled string in it (titles, URLs, quoted
 * markup) is protected only by each template's own escaping. One missed
 * escape would run site-controlled script; with the network cut off here it
 * can reach neither the compose services nor the outside.
 */

import type { BrowserContext } from 'playwright';

/** Every request the rendered document makes is refused, except the inline
 *  schemes a self-contained report uses. */
export async function cutOffNetwork(context: BrowserContext): Promise<void> {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('data:') || url.startsWith('about:') || url.startsWith('blob:')) {
      return route.continue();
    }
    return route.abort('blockedbyclient');
  });
}
