/**
 * Plan 075 M7: a site's catch-all answer. Some sites answer any unknown path
 * with 200 and one error document that neither its title nor its heading
 * calls an error (yonahotel.com: a `noindex` page headed « Elsewhere starts
 * Here »). Stale links and malformed hrefs then land on it, and each landing
 * was analysed as a content page, because the soft-404 rule needs an error
 * slug, title or heading.
 *
 * The scan asks the site directly: one request for a path that cannot exist,
 * under the root and under each language prefix the site uses (a site serves
 * one catch-all per language). A page whose raw document has the same text
 * signature as a 2xx answer to such a probe is that catch-all.
 *
 * A single-page application serves one raw shell for every route, the real
 * pages included, so a probe signature that equals the homepage's says
 * nothing about errors and is ignored; so is every probe when the homepage's
 * raw signature is unknown. A probe that redirected is ignored too: its
 * target is a page the other rules already judge.
 */
import { normalizeUrlIdentity } from './url-identity.js';

/** One probe of a path that cannot exist, as the scan recorded it. */
export interface CatchAllProbe {
  /** The requested path. */
  url: string;
  /** Where the answer settled after redirects. */
  landedUrl?: string;
  httpStatus?: number;
  /** The raw document's text signature, the same measure the render diff
   *  stores for every page (`rawDocument.textSignature`). */
  textSignature?: string;
  fetchError?: string;
}

/** The raw text signatures that identify the site's catch-all answer. */
export function catchAllTextSignatures(
  probes: readonly CatchAllProbe[] | undefined,
  homepageTextSignature: string | undefined,
): ReadonlySet<string> {
  const signatures = new Set<string>();
  if (probes === undefined || homepageTextSignature === undefined) return signatures;
  for (const probe of probes) {
    if (probe.textSignature === undefined || probe.httpStatus === undefined) continue;
    if (probe.httpStatus < 200 || probe.httpStatus >= 300) continue;
    if (probe.textSignature === homepageTextSignature) continue;
    const landed = probe.landedUrl ?? probe.url;
    if (normalizeUrlIdentity(landed) !== normalizeUrlIdentity(probe.url)) continue;
    signatures.add(probe.textSignature);
  }
  return signatures;
}
