export interface RobotsRules {
  /** Whether robots.txt was actually reachable. false implies allow-all. */
  found: boolean;
  disallow: string[];
  allow: string[];
  crawlDelayMs?: number;
  /** Sitemap: directive values, if any. Unlike disallow/allow/crawl-delay
   *  these are not scoped to a user-agent group - the spec treats them as
   *  global, so they are collected from the whole file regardless of
   *  which group is "current" when the line is seen. Reused by
   *  checks/sitemap.ts so a sitemap check never re-fetches robots.txt. */
  sitemapUrls: string[];
}

/**
 * Translates a robots.txt path pattern into a matcher. Supports the
 * commonly-relied-on subset: literal prefix matching, '*' as a wildcard
 * for any sequence of characters, and a trailing '$' as an end-of-string
 * anchor. Full RFC 9309 edge cases (group merging across records with
 * identical user-agents, etc.) are out of scope.
 */
function patternToRegExp(pattern: string): RegExp {
  const hasEndAnchor = pattern.endsWith('$');
  const body = hasEndAnchor ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split('*')
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}${hasEndAnchor ? '$' : ''}`);
}

interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
  crawlDelayMs?: number;
}

/**
 * Pure parser: given robots.txt text and the crawler's own user agent,
 * returns the rules from the most specific matching group (exact
 * user-agent match, falling back to '*'). Consecutive User-agent lines
 * with no intervening directive share one group, per the standard
 * grouping rule; a directive line closes the group for subsequent
 * User-agent lines.
 */
export function parseRobotsTxt(text: string, userAgent: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  const sitemapUrls: string[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const field = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (field === 'sitemap') {
      if (value) sitemapUrls.push(value);
      continue;
    }

    if (field === 'user-agent') {
      const groupIsOpen = current !== null && current.disallow.length === 0 && current.allow.length === 0 && current.crawlDelayMs === undefined;
      if (!groupIsOpen) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current!.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (field === 'disallow') {
      if (value) current.disallow.push(value);
      continue;
    }
    if (field === 'allow') {
      if (value) current.allow.push(value);
      continue;
    }
    if (field === 'crawl-delay') {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = Math.round(seconds * 1000);
    }
  }

  const ua = userAgent.toLowerCase();
  const matched = groups.find((g) => g.agents.includes(ua)) ?? groups.find((g) => g.agents.includes('*'));

  if (!matched) return { found: true, disallow: [], allow: [], sitemapUrls };

  const result: RobotsRules = { found: true, disallow: matched.disallow, allow: matched.allow, sitemapUrls };
  if (matched.crawlDelayMs !== undefined) result.crawlDelayMs = matched.crawlDelayMs;
  return result;
}

/**
 * Longest matching pattern wins; a tie between an allow and a disallow
 * of equal length resolves to allow. No match at all means allowed.
 */
export function isAllowedByRobots(rules: RobotsRules, pathname: string): boolean {
  let bestLength = -1;
  let bestIsAllow = true;

  const consider = (pattern: string, isAllow: boolean): void => {
    if (pattern.length < bestLength) return;
    if (!patternToRegExp(pattern).test(pathname)) return;
    if (pattern.length > bestLength) {
      bestLength = pattern.length;
      bestIsAllow = isAllow;
    } else if (isAllow) {
      bestIsAllow = true;
    }
  };

  for (const pattern of rules.disallow) consider(pattern, false);
  for (const pattern of rules.allow) consider(pattern, true);

  return bestLength === -1 ? true : bestIsAllow;
}

/**
 * A missing or unreachable robots.txt is allow-all: found: false, no
 * rules. A network error (as opposed to a clean 404) is logged, since
 * that's a real problem rather than an expected absence.
 */
export async function fetchRobotsRules(
  origin: string,
  userAgent: string,
  timeoutMs: number,
): Promise<RobotsRules> {
  try {
    const response = await fetch(new URL('/robots.txt', origin), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { found: false, disallow: [], allow: [], sitemapUrls: [] };
    }
    const text = await response.text();
    return parseRobotsTxt(text, userAgent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`odysseus: failed to fetch robots.txt for ${origin}: ${message}`);
    return { found: false, disallow: [], allow: [], sitemapUrls: [] };
  }
}
