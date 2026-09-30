import path from 'node:path';
import { normalizeUrlIdentity } from '@odysseus/core';

/**
 * Extensions for resources that are never an HTML page worth crawling.
 * Catches cases like a WordPress site's wp-content/uploads/*.jpg
 * attachment URLs before they're ever enqueued, so they never cost a
 * crawl-budget slot, a politeness delay, or a render/axe/Lighthouse pass.
 * crawl.ts also checks the response's Content-Type as a fallback for
 * URLs whose extension doesn't reveal what they are.
 */
const NON_HTML_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.svg',
  '.ico',
  '.bmp',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.rar',
  '.7z',
  '.gz',
  '.tar',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.webm',
  '.wav',
  '.ogg',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
]);

/** report-feedback-la-corniche.md item 1.3: a real 20-page crawl of a
 *  5-star hotel site spent five of its slots on `/`, `/en/`, `/es/`,
 *  `/it/` and `/pt-pt/` - the same homepage in five languages - inflating
 *  every homepage defect's occurrence count roughly fivefold and leaving
 *  whole page families of the site unvisited. Matches only a same-origin
 *  link whose ENTIRE path is one language-code segment (a 2-letter ISO
 *  code, optionally with a region suffix like "pt-pt"), root-relative -
 *  deliberately narrow so a genuine content page nested under a language
 *  prefix (`/en/rooms/`) is never dropped, only the bare homepage
 *  duplicate itself. Same drop point and reasoning as NON_HTML_EXTENSIONS
 *  above: decided from the URL alone, before any fetch, so a dropped
 *  variant never costs a crawl-budget slot and never appears in the
 *  manifest at all - not something this needs to track and report a
 *  count for, any more than the extension filter does. */
const LANGUAGE_HOMEPAGE_PATH_PATTERN = /^\/[a-z]{2}(-[a-z]{2})?\/?$/i;

/**
 * Revised 2026-08-24 (Domaine Lagnonu). The rule above was right about
 * the duplicate and wrong about the drop. On La Corniche the language
 * homepages were reachable content that also duplicated the homepage; on
 * lagnonu.fr `/en` and `/es` are the ONLY links from the French homepage
 * into their subtrees, so dropping them severed both entirely and left 22
 * declared pages unvisited - the exact "whole page families of the site
 * unvisited" outcome the original rule was written to prevent.
 *
 * The URL is therefore no longer dropped here. crawl.ts enqueues it,
 * extracts its links, and records it `discovered-not-scanned`, so no
 * scanner ever runs against it and it emits no findings. Both sites get
 * what they need: no duplicated homepage defects, no severed subtree.
 */
export function isLanguageHomepagePath(pathname: string): boolean {
  return LANGUAGE_HOMEPAGE_PATH_PATTERN.test(pathname);
}

/** B3 (2026-08-24 three-site review): a real haaitza.com crawl spent
 *  eight of its slots on URLs of the form
 *  `/?post_type=popup_theme&p=1317` - WordPress Popup Maker's internal
 *  theme objects, not pages anyone can navigate to. Each cost a render, an
 *  axe pass and a Lighthouse pass, produced findings against machinery
 *  rather than content, and three of them were then printed to the client
 *  in the legal-exposure section as "examples of pages where the booking
 *  engine was found".
 *
 *  Keyed on the `post_type` query parameter carrying one of WordPress's
 *  own internal, non-public post types, not on the presence of a query
 *  string: `?page=2` and `?s=...` are real, navigable pages on countless
 *  sites, and dropping every query URL would silently shrink the audited
 *  scope. Same drop point as the two filters above - decided from the URL
 *  alone, before any fetch, so a dropped URL never costs a crawl-budget
 *  slot and never reaches the manifest. Add to this list only post types
 *  confirmed non-public against a real site, never guessed. */
const NON_PUBLIC_WP_POST_TYPES = new Set([
  'popup_theme',
  'popup',
  'wp_block',
  'wp_template',
  'wp_template_part',
  'wp_global_styles',
  'wp_navigation',
  'nav_menu_item',
  'revision',
  'custom_css',
  'customize_changeset',
  'oembed_cache',
  'user_request',
  'acf-field',
  'acf-field-group',
  'rl_gallery',
]);

// E9: confirmed against grandhoteldesalpes' sitemap. Keep this separate from
// the query-string admission list above because these objects arrive as
// ordinary sitemap paths and need structural, not URL-shape, evidence.
const NON_PUBLIC_PLUGIN_POST_TYPES = new Set(['rl_gallery']);

export interface NonPublicPluginObjectInput {
  discoveryMethod: 'link' | 'seed' | 'sitemap-only';
  discoveredFrom?: string;
  bodyClassTokens: readonly string[];
}

export interface NonPublicPluginObjectEvidence {
  postType: string;
  bodyClass: string;
}

/** E9's structural admission rule: sitemap-only, no inbound page link, and
 * a body class for a plugin post type confirmed to be non-public. */
export function classifyNonPublicPluginObject(
  input: NonPublicPluginObjectInput,
): NonPublicPluginObjectEvidence | undefined {
  if (input.discoveryMethod !== 'sitemap-only' || input.discoveredFrom !== undefined) {
    return undefined;
  }
  for (const bodyClass of input.bodyClassTokens) {
    for (const postType of NON_PUBLIC_PLUGIN_POST_TYPES) {
      if (new RegExp(`(?:^|[-_])${postType}(?:$|[-_])`, 'iu').test(bodyClass)) {
        return { postType, bodyClass };
      }
    }
  }
  return undefined;
}

function isNonPublicWordPressObject(url: URL): boolean {
  const postType = url.searchParams.get('post_type');
  return postType !== null && NON_PUBLIC_WP_POST_TYPES.has(postType.toLowerCase());
}

/** Exact hostname or the same hostname with only a leading `www.` added
 *  or removed. This is the deliberately narrow site identity proven safe
 *  by the real redirect cases recorded in trade-off 31. */
export function isSameSiteHostname(requestedHostname: string, candidateHostname: string): boolean {
  if (requestedHostname === candidateHostname) return true;
  return (
    requestedHostname === `www.${candidateHostname}` ||
    candidateHostname === `www.${requestedHostname}`
  );
}

/**
 * Converts an operator-supplied glob pattern (only `*` is a wildcard,
 * matching any run of characters including none) into a RegExp anchored
 * over the full URL string. Every other regex metacharacter is escaped
 * literally, so a pattern like "*.pdf" or one ending in a wildcard
 * segment behaves the way an operator typing a glob expects, rather than
 * as a regex fragment.
 */
export function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, (char) =>
    char === '*' ? '.*' : `\\${char}`,
  );
  return new RegExp(`^${escaped}$`);
}

export interface NormalizePageUrlOptions {
  exclusionPatterns?: readonly string[];
  allowWwwApex?: boolean;
}

/** Normalizes one possible HTML page URL through the shared admission
 *  policy used by link discovery and sitemap supplementation. */
export function normalizePageUrl(
  href: string,
  baseUrl: string,
  options: NormalizePageUrlOptions = {},
): string | undefined {
  let resolved: URL;
  const base = new URL(baseUrl);
  try {
    resolved = new URL(href, base);
  } catch {
    return undefined;
  }

  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return undefined;
  if (options.allowWwwApex && isSameSiteHostname(base.hostname, resolved.hostname)) {
    // Sitemap mirrors commonly retain an HTTP spelling after the site moves
    // to HTTPS. Keep one protocol identity for the crawl's authorized site.
    resolved.protocol = base.protocol;
  }
  const hostAllowed = options.allowWwwApex
    ? isSameSiteHostname(base.hostname, resolved.hostname) && resolved.port === base.port
    : resolved.origin === base.origin;
  if (!hostAllowed) return undefined;

  if (resolved.pathname.length > 1 && resolved.pathname.endsWith('/')) {
    resolved.pathname = resolved.pathname.slice(0, -1);
  }
  if (NON_HTML_EXTENSIONS.has(path.posix.extname(resolved.pathname).toLowerCase()))
    return undefined;
  if (isNonPublicWordPressObject(resolved)) return undefined;
  dropTrackingParameters(resolved);
  resolved.hash = '';
  const normalized = normalizeUrlIdentity(resolved.toString()) ?? resolved.toString();
  const exclusionRegexes = (options.exclusionPatterns ?? []).map(globToRegExp);
  if (exclusionRegexes.some((pattern) => pattern.test(normalized))) return undefined;
  return normalized;
}

/** Campaign and click identifiers that analytics and ad platforms append to
 *  a link. They never select content, so a link carrying them is the page
 *  without them (plan 075 M3: yonahotel.com linked its own pages with
 *  `_gl` and `gclid` values, and each tagged copy was crawled and analysed
 *  beside the clean page). */
const TRACKING_PARAMETER =
  /^(?:utm_[a-z0-9_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|yclid|igshid|_gl|_ga|mc_cid|mc_eid)$/i;

function dropTrackingParameters(url: URL): void {
  const tracking = [...url.searchParams.keys()].filter((key) => TRACKING_PARAMETER.test(key));
  if (tracking.length === 0) return;
  for (const key of tracking) url.searchParams.delete(key);
  if ([...url.searchParams.keys()].length === 0) url.search = '';
}

/** The page-identity half of normalizePageUrl, on its own: trailing-slash
 *  equivalence and fragment stripping, with no origin, extension, or
 *  exclusion judgment. Issue #102: this rule must hold at every door a URL
 *  can enter the crawl through, not only link discovery, or two spellings
 *  of one page are both enqueued, both content-checked, and both counted in
 *  every analyzed-page denominator. The crawl applies it to its own start
 *  URL and to operator seeds (discovered links and sitemap entries already
 *  get it through normalizePageUrl), so a duplicate variant never costs a
 *  second crawl - the politeness rule makes the prevention, not a
 *  post-hoc merge, the only acceptable fix. The bare root path is
 *  deliberately preserved: "https://site.example/" has no shorter
 *  spelling to collapse to. */
export function normalizePageIdentityUrl(url: string): string | undefined {
  return normalizeUrlIdentity(url);
}

/** Whether a link or sitemap entry, as written, spells its path with a
 *  trailing slash the page identity drops. The crawl keeps this as a hint:
 *  some sites serve a page only under its slashed spelling and redirect the
 *  bare one to the homepage (atrium-hotel.fr). */
export function isWrittenWithTrailingSlash(absoluteUrl: string): boolean {
  try {
    const { pathname } = new URL(absoluteUrl);
    return pathname.length > 1 && pathname.endsWith('/');
  } catch {
    return false;
  }
}

/** The slashed spelling of a slash-free page identity, or undefined for the
 *  root path, which has no other spelling. */
export function slashedSpelling(identityUrl: string): string | undefined {
  try {
    const url = new URL(identityUrl);
    if (url.pathname === '/' || url.pathname.endsWith('/')) return undefined;
    url.pathname = `${url.pathname}/`;
    return url.toString();
  } catch {
    return undefined;
  }
}

export interface RelativeLinkNestingEvidence {
  sourceUrl: string;
  href: string;
  resolvedUrl: string;
  repeatedSegment: string;
}

/**
 * Detects the common relative-link loop where a page in `/fr/...` emits
 * `fr/...`, resolving to `/fr/fr/...`. Only raw relative hrefs are eligible;
 * absolute and root-relative links are real navigation choices and are left
 * alone.
 */
export function relativeLinkNestingEvidence(
  href: string,
  pageUrl: string,
): RelativeLinkNestingEvidence | undefined {
  const trimmed = href.trim();
  if (
    trimmed.length === 0 ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('//')
  ) {
    return undefined;
  }

  let page: URL;
  let resolved: URL;
  try {
    page = new URL(pageUrl);
    resolved = new URL(trimmed, page);
  } catch {
    return undefined;
  }
  if (resolved.origin !== page.origin) return undefined;

  const currentSegments = page.pathname.split('/').filter(Boolean);
  const resolvedSegments = resolved.pathname.split('/').filter(Boolean);
  const rawFirstSegment = trimmed.split(/[/?#]/, 1)[0]?.toLowerCase();
  if (rawFirstSegment === undefined || rawFirstSegment.length === 0) return undefined;

  for (let index = 0; index < currentSegments.length; index += 1) {
    const segment = currentSegments[index]?.toLowerCase();
    if (segment !== rawFirstSegment) continue;
    if (
      resolvedSegments[index]?.toLowerCase() === segment &&
      resolvedSegments[index + 1]?.toLowerCase() === segment
    ) {
      return {
        sourceUrl: normalizeUrlIdentity(pageUrl) ?? pageUrl,
        href,
        resolvedUrl: normalizeUrlIdentity(resolved.toString()) ?? resolved.toString(),
        repeatedSegment: segment,
      };
    }
  }
  return undefined;
}

/**
 * Resolves a page's raw href attributes into absolute, deduped internal
 * URLs. "Internal" means exact origin match (protocol + hostname +
 * port) - a subdomain like blog.client.com is treated as external and
 * not followed. Non-http(s) schemes (mailto:, tel:, javascript:, data:)
 * and unparsable hrefs are dropped. Hash fragments are stripped since
 * they identify a position within a page, not a distinct page. Links to
 * non-HTML resources (images, documents, archives, media, fonts) are
 * dropped by extension, and a bare root-level language-code homepage
 * variant (`/en/`, `/pt-pt/`) is dropped by path pattern (item 1.3, see
 * LANGUAGE_HOMEPAGE_PATH_PATTERN above) - both decided from the URL
 * alone, before any fetch. exclusionPatterns (manual-input-layer milestone,
 * JobOptionsSnapshot.exclusions): a URL matching any glob is dropped here,
 * before it is ever enqueued, so it never consumes a crawl-budget slot -
 * same drop point as the extension check above.
 */
export function normalizeInternalLinks(
  hrefs: (string | null)[],
  baseUrl: string,
  exclusionPatterns: readonly string[] = [],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const href of hrefs) {
    if (!href) continue;
    const normalized = normalizePageUrl(href, baseUrl, { exclusionPatterns });
    if (normalized === undefined) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
