import path from 'node:path';

/**
 * Extensions for resources that are never an HTML page worth crawling.
 * Catches cases like a WordPress site's wp-content/uploads/*.jpg
 * attachment URLs before they're ever enqueued, so they never cost a
 * crawl-budget slot, a politeness delay, or a render/axe/Lighthouse pass.
 * crawl.ts also checks the response's Content-Type as a fallback for
 * URLs whose extension doesn't reveal what they are.
 */
const NON_HTML_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico', '.bmp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.rar', '.7z', '.gz', '.tar',
  '.mp3', '.mp4', '.mov', '.avi', '.webm', '.wav', '.ogg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
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
]);

function isNonPublicWordPressObject(url: URL): boolean {
  const postType = url.searchParams.get('post_type');
  return postType !== null && NON_PUBLIC_WP_POST_TYPES.has(postType.toLowerCase());
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
  const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, (char) => (char === '*' ? '.*' : `\\${char}`));
  return new RegExp(`^${escaped}$`);
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
  const base = new URL(baseUrl);
  const exclusionRegexes = exclusionPatterns.map(globToRegExp);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const href of hrefs) {
    if (!href) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, base);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    if (resolved.origin !== base.origin) continue;
    // A real haaitza.com crawl linked the same GDPR-form page as both
    // /formulaire-rgpd and /formulaire-rgpd/ from different pages on the
    // site - two hrefs, one page, but hashUrl() (paths.ts) hashes the full
    // URL string, so they landed in distinct page directories and each
    // cost its own crawl slot, render-diff, axe pass, and Lighthouse pass.
    // Servers overwhelmingly treat the two forms as the same resource (one
    // typically redirects to the other), so collapsing them here is safe
    // in a way collapsing arbitrary query strings would not be - unlike
    // LANGUAGE_HOMEPAGE_PATH_PATTERN above, this is not narrowed to one
    // specific pattern because there is no comparable risk of dropping
    // distinct content by stripping a trailing slash.
    if (resolved.pathname.length > 1 && resolved.pathname.endsWith('/')) {
      resolved.pathname = resolved.pathname.slice(0, -1);
    }
    if (NON_HTML_EXTENSIONS.has(path.posix.extname(resolved.pathname).toLowerCase())) continue;
    if (isNonPublicWordPressObject(resolved)) continue;
    resolved.hash = '';
    const normalized = resolved.toString();
    if (exclusionRegexes.some((pattern) => pattern.test(normalized))) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
