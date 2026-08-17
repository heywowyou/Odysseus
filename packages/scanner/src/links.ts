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
 * dropped by extension. exclusionPatterns (manual-input-layer milestone,
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
    if (NON_HTML_EXTENSIONS.has(path.posix.extname(resolved.pathname).toLowerCase())) continue;
    resolved.hash = '';
    const normalized = resolved.toString();
    if (exclusionRegexes.some((pattern) => pattern.test(normalized))) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
