/**
 * Plain-HTTP-only page fetch for the prospecting qualification stage, per
 * docs/rules/prospect-qualification.md section 5: "The plain HTTP stage must
 * not use Chromium." No HTML-parsing dependency added, matching
 * @odysseus/scanner's own extract-text.ts hand-rolled precedent -
 * htmlToText is deliberately crude, since it only needs to preserve
 * visible-text patterns well enough for @odysseus/scanner's
 * extractMentionsLegales regexes to match, not full rendering fidelity.
 * An SPA whose mentions-legales content renders client-side yields an
 * empty shell and no SIREN here - per the governing doc's own framing,
 * that is correct behavior ("a site publishing no resolvable SIREN is
 * dropped... it is not a prospect"), not a gap.
 */

const SCRIPT_OR_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_PATTERN = /<[^>]+>/g;
const WHITESPACE_PATTERN = /\s+/g;

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(amp|lt|gt|quot|#39|apos|nbsp);/g,
    (match) => HTML_ENTITIES[match] ?? match,
  );
}

export function htmlToText(html: string): string {
  const withoutScriptsAndStyles = html.replace(SCRIPT_OR_STYLE_PATTERN, ' ');
  const withoutTags = withoutScriptsAndStyles.replace(TAG_PATTERN, ' ');
  return decodeEntities(withoutTags).replace(WHITESPACE_PATTERN, ' ').trim();
}

const ANCHOR_HREF_PATTERN = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;

/** Resolved hrefs. Same-origin only by default - the mentions-legales page is
 *  always on the same site as the homepage that links to it, which is all
 *  milestone 9a ever needed.
 *
 *  `includeOffOrigin` exists for plan 003, where an off-domain link is itself
 *  the fact being measured: a hotel whose only booking route is an OTA listing
 *  has a different funnel from one selling direct, and the default would hide
 *  exactly the links that distinguish them. The default is unchanged so the
 *  shipped 9a callers keep their current behaviour. */
export function extractAnchorHrefs(
  html: string,
  baseUrl: string,
  options: { includeOffOrigin?: boolean } = {},
): string[] {
  const baseOrigin = new URL(baseUrl).origin;
  const hrefs: string[] = [];
  for (const match of html.matchAll(ANCHOR_HREF_PATTERN)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const resolved = new URL(raw, baseUrl);
      if (!/^https?:$/.test(resolved.protocol)) continue;
      if (options.includeOffOrigin !== true && resolved.origin !== baseOrigin) continue;
      hrefs.push(resolved.href);
    } catch {
      continue;
    }
  }
  return hrefs;
}

export interface FetchedPage {
  url: string;
  bodyText: string;
  anchorUrls: string[];
}

/** Returns null on any failure (network, non-2xx, timeout) rather than
 *  throwing - matches obligation-stage.ts's "degrade, never crash the
 *  batch" posture. */
export async function fetchPageText(
  url: string,
  timeoutMs: number,
  userAgent: string,
): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': userAgent },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const html = await response.text();
    return {
      url: response.url || url,
      bodyText: htmlToText(html),
      anchorUrls: extractAnchorHrefs(html, url),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const MAILTO_HREF_PATTERN = /<a\b[^>]*\bhref\s*=\s*["'](mailto:[^"']+)["'][^>]*>/gi;

/** `mailto:` targets, which extractAnchorHrefs drops by design (it resolves
 *  http(s) URLs only). Milestone 9c plan 007 needs them because a hotel whose
 *  footer renders its address as an envelope icon publishes it nowhere else on
 *  the page. */
export function extractMailtoTargets(html: string): string[] {
  const targets: string[] = [];
  for (const match of html.matchAll(MAILTO_HREF_PATTERN)) {
    const raw = match[1];
    if (raw !== undefined) targets.push(raw);
  }
  return targets;
}
