/**
 * Link discovery shared by every browser-state surface (plan 059 sections
 * 3.2, 5.4 and 6): a rendered, hydrated, consent-dismissed or local-state
 * page can expose anchors the static crawl never saw, and those URLs are
 * the input to the bounded discovery fixed point. Every surface reads its
 * links through this one place so admission policy (origin, non-HTML
 * extensions, operator exclusions) cannot drift between surfaces, and every
 * discovered link carries the surface it was read from so provenance is
 * recorded at the moment of discovery rather than reconstructed afterwards.
 */
import type { Page } from 'playwright';
import type { InventoryDiscoverySource } from './inventory-ledger.js';
import { normalizeInternalLinks, relativeLinkNestingEvidence } from './links.js';

/**
 * One link a state surface exposed, with the provenance the inventory
 * ledger records for it (plan 059 section 5.4). Surfaces that render the
 * page differently but do not wait on hydration (mobile, consent-dismissed,
 * a safe local state) discover under `rendered-link`; the hydration sweep's
 * own links are `hydrated-link`, which is what turns on the section 6
 * fixed-point rule.
 */
export type SurfaceLinkSource = Extract<
  InventoryDiscoverySource,
  'rendered-link' | 'hydrated-link'
>;

export interface SurfaceLinkDiscovery {
  url: string;
  source: SurfaceLinkSource;
  surfaceId: string;
}

/**
 * Reads every internal anchor on an already-loaded page and returns the
 * normalized same-origin identities, ready for `recordDiscovery`. No
 * navigation of its own: the caller passes a page that is already settled,
 * so this never counts as an additional page load.
 */
export async function collectSurfaceLinks(
  page: Page,
  options: { baseUrl: string; exclusionPatterns?: readonly string[] },
): Promise<string[]> {
  const hrefs = await page.$$eval('a[href]', (anchors) =>
    anchors.map((anchor) => anchor.getAttribute('href')),
  );
  // Issue #497, as crawl.ts reads it: a relative href resolves against the
  // document's base URL, which <base href> can move away from the page URL.
  // A site with <base href="/"> and `en/rooms.html` links on /en/ pages
  // otherwise yields /en/en/rooms.html, which its server answers, and every
  // wave nests one level deeper. A relative href that repeats its own
  // directory is dropped for the same reason the crawl disposes it.
  const documentBase = await page.evaluate(() => document.baseURI).catch(() => options.baseUrl);
  const resolved = hrefs.map((href) => {
    if (href === null || relativeLinkNestingEvidence(href, documentBase) !== undefined) return null;
    try {
      return new URL(href, documentBase).href;
    } catch {
      return href;
    }
  });
  return normalizeInternalLinks(resolved, options.baseUrl, options.exclusionPatterns ?? []);
}
