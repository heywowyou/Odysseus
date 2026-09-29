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
import { readDocumentBase, readPageAnchors, resolvePageLinks } from './link-admission.js';
import type { RelativeLinkNestingEvidence } from './links.js';

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

/** One link read on a surface. A link the crawl would refuse on sight, an
 *  operator exclusion or a relative href that nests its own directory, is
 *  kept with its reason so the discovery waves record it as the crawl does
 *  (issue #566), instead of dropping it without a trace. */
export interface SurfaceLink {
  url: string;
  nesting?: RelativeLinkNestingEvidence;
  operatorExcluded?: true;
}

export interface SurfaceLinkDiscovery extends SurfaceLink {
  source: SurfaceLinkSource;
  surfaceId: string;
}

/**
 * Reads every internal anchor on an already-loaded page through the crawl's
 * own link admission (issue #566): the same document-base resolution,
 * normalization, exclusions and nesting evidence. No navigation of its own:
 * the caller passes a page that is already settled, so this never counts as
 * an additional page load.
 */
export async function collectSurfaceLinks(
  page: Page,
  options: { baseUrl: string; exclusionPatterns?: readonly string[] },
): Promise<SurfaceLink[]> {
  const anchors = await readPageAnchors(page);
  const documentBase = await readDocumentBase(page, options.baseUrl);
  const resolved = resolvePageLinks(anchors, {
    documentBase,
    landedUrl: options.baseUrl,
    exclusions: options.exclusionPatterns ?? [],
  });
  return [
    ...resolved.links.map((link): SurfaceLink => ({
      url: link.url,
      ...(link.nesting !== undefined ? { nesting: link.nesting } : {}),
    })),
    ...resolved.excluded.map((link): SurfaceLink => ({ url: link.url, operatorExcluded: true })),
  ];
}
