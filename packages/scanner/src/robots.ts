import { getCrawlerUserAgent } from './config.js';
import type { NetworkSafetyDisposition, NetworkTargetPolicy } from './network-target-policy.js';
import { fetchWithNetworkPolicy, NetworkSafetyBlockedError } from './safe-fetch.js';

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
 * anchor.
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

/** RFC 9309 matches a group by the crawler's product token, case-insensitively:
 *  the part of the User-Agent before the first '/' or whitespace. A bare
 *  token (the AI crawler list passes these) is its own product token. */
export function robotsProductToken(userAgent: string): string {
  return userAgent.trim().split(/[/\s]/, 1)[0]!.toLowerCase();
}

/** The bot was published as OdysseusBot but crawled for a while as
 *  OdysseusAuditBot. A site owner may have blocked either name (the one on
 *  our /bot page or the one in their logs), so both are honoured. */
const ODYSSEUS_TOKEN_ALIASES = ['odysseusbot', 'odysseusauditbot'];

function robotsMatchTokens(userAgent: string): Set<string> {
  const token = robotsProductToken(userAgent);
  return new Set(ODYSSEUS_TOKEN_ALIASES.includes(token) ? ODYSSEUS_TOKEN_ALIASES : [token]);
}

/**
 * Pure parser: given robots.txt text and the crawler's own user agent,
 * returns the rules of every group naming the crawler's product token
 * (RFC 9309 merges them: allow and disallow lists concatenate, the largest
 * crawl-delay wins), falling back to the merged '*' groups only when no
 * group names the crawler. Consecutive User-agent lines with no
 * intervening directive share one group, per the standard grouping rule;
 * a directive line closes the group for subsequent User-agent lines.
 */
export function parseRobotsTxt(text: string, userAgent: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  const sitemapUrls: string[] = [];
  let current: RobotsGroup | null = null;
  let currentGroupHasRuleLine = false;

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine
      .replace(/^\uFEFF/u, '')
      .replace(/#.*$/, '')
      .trim();
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
      if (current === null || currentGroupHasRuleLine) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
        currentGroupHasRuleLine = false;
      }
      current!.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (field === 'disallow') {
      currentGroupHasRuleLine = true;
      if (value) current.disallow.push(value);
      continue;
    }
    if (field === 'allow') {
      currentGroupHasRuleLine = true;
      if (value) current.allow.push(value);
      continue;
    }
    if (field === 'crawl-delay') {
      currentGroupHasRuleLine = true;
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0)
        current.crawlDelayMs = Math.round(seconds * 1000);
    }
  }

  const tokens = robotsMatchTokens(userAgent);
  const specific = groups.filter((g) => g.agents.some((agent) => tokens.has(agent)));
  const matched = specific.length > 0 ? specific : groups.filter((g) => g.agents.includes('*'));

  const result: RobotsRules = {
    found: true,
    disallow: matched.flatMap((g) => g.disallow),
    allow: matched.flatMap((g) => g.allow),
    sitemapUrls,
  };
  const delays = matched.flatMap((g) => (g.crawlDelayMs === undefined ? [] : [g.crawlDelayMs]));
  if (delays.length > 0) result.crawlDelayMs = Math.max(...delays);
  return result;
}

/**
 * Longest matching pattern wins; a tie between an allow and a disallow
 * of equal length resolves to allow. Returns the winning Disallow
 * pattern's own text when the page ends up blocked, or undefined when it
 * is allowed (no match at all, or an allow won) - exported (not just
 * isAllowedByRobots' boolean) because milestone 8.5a's
 * robots-disallow-broad check needs to know *which* disallow pattern is
 * actually responsible for blocking a given page, not just that it is
 * blocked, so it can tally matches per pattern.
 */
export function findBlockingPattern(rules: RobotsRules, pathname: string): string | undefined {
  let bestLength = -1;
  let bestDisallowPattern: string | undefined;

  const consider = (pattern: string, isAllow: boolean): void => {
    if (pattern.length < bestLength) return;
    if (!patternToRegExp(pattern).test(pathname)) return;
    if (pattern.length > bestLength) {
      bestLength = pattern.length;
      bestDisallowPattern = isAllow ? undefined : pattern;
    } else if (isAllow) {
      bestDisallowPattern = undefined;
    }
  };

  for (const pattern of rules.disallow) consider(pattern, false);
  for (const pattern of rules.allow) consider(pattern, true);

  return bestDisallowPattern;
}

/**
 * Longest matching pattern wins; a tie between an allow and a disallow
 * of equal length resolves to allow. No match at all means allowed.
 */
export function isAllowedByRobots(rules: RobotsRules, pathname: string): boolean {
  return findBlockingPattern(rules, pathname) === undefined;
}

/**
 * Fetches the raw robots.txt text, or null if it is missing or
 * unreachable. Exported separately from fetchRobotsRules (milestone 8.6)
 * so a caller that needs to parse the same file against more than one
 * user-agent - milestone 8.6's AI-crawler-access check parses it once
 * per named AI bot, on top of the crawler's own user-agent - can do so
 * from one fetch instead of one per agent. A network error (as opposed
 * to a clean 404) is logged, since that's a real problem rather than an
 * expected absence.
 */
export interface RobotsFetchOptions {
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: (disposition: NetworkSafetyDisposition) => void;
}

export async function fetchRobotsText(
  origin: string,
  timeoutMs: number,
  userAgent: string = getCrawlerUserAgent(),
  options: RobotsFetchOptions = {},
): Promise<string | null> {
  try {
    const url = new URL('/robots.txt', origin).href;
    const request = {
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    };
    const response =
      options.networkPolicy === undefined
        ? await fetch(url, request)
        : await fetchWithNetworkPolicy(url, request, {
            policy: options.networkPolicy,
            ...(options.onNetworkSafetyBlocked !== undefined
              ? { onBlocked: options.onNetworkSafetyBlocked }
              : {}),
          });
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    if (error instanceof NetworkSafetyBlockedError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`odysseus: failed to fetch robots.txt for ${origin}: ${message}`);
    return null;
  }
}

/**
 * A missing or unreachable robots.txt is allow-all: found: false, no
 * rules.
 */
export async function fetchRobotsRules(
  origin: string,
  userAgent: string,
  timeoutMs: number,
): Promise<RobotsRules> {
  const text = await fetchRobotsText(origin, timeoutMs, userAgent);
  if (text === null) return { found: false, disallow: [], allow: [], sitemapUrls: [] };
  return parseRobotsTxt(text, userAgent);
}

/**
 * Milestone 8.6: the named user-agent tokens AI answer/training crawlers
 * identify themselves with. Sourced from each vendor's own published bot
 * documentation at the time this check was written - GPTBot and
 * ChatGPT-User (OpenAI), ClaudeBot (Anthropic), Google-Extended (Google's
 * opt-out token for Gemini/AI features, distinct from Googlebot itself),
 * PerplexityBot (Perplexity). A vendor renaming or adding a token later
 * is a real, expected way this list goes stale - it is not meant to be
 * exhaustive forever.
 */
export const AI_CRAWLER_USER_AGENTS = [
  'GPTBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Google-Extended',
  'PerplexityBot',
];

export interface AiCrawlerAccessResult {
  agent: string;
  blocked: boolean;
  disallowPattern?: string;
}

/**
 * Pure: given already-fetched robots.txt text (or null for "no robots.txt
 * at all", which is allow-all for every agent), reports whether each
 * named AI crawler is blocked from the site root. Checked against '/'
 * specifically - this answers "can the crawler get in the door at all",
 * the cheapest and most upstream GEO signal there is, not a full-site
 * breadth analysis the way robots-disallow-broad already does for the
 * primary crawler.
 */
export function checkAiCrawlerAccess(
  robotsText: string | null,
  userAgents: string[],
): AiCrawlerAccessResult[] {
  return userAgents.map((agent) => {
    if (robotsText === null) return { agent, blocked: false };
    const rules = parseRobotsTxt(robotsText, agent);
    const disallowPattern = findBlockingPattern(rules, '/');
    return disallowPattern === undefined
      ? { agent, blocked: false }
      : { agent, blocked: true, disallowPattern };
  });
}
