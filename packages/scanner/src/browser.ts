import { chromium, type Browser } from 'playwright';

/**
 * Identifies Odysseus per the crawling-politeness rule. This is the
 * fallback config.ts's getCrawlerUserAgent() returns when CRAWLER_USER_AGENT
 * is unset, so it is the identity that actually goes out on the wire by
 * default. The odysseus.example domain is a placeholder: replace it with
 * a real, reachable domain before running against any site not owned by
 * the operator.
 */
export const ODYSSEUS_USER_AGENT =
  'OdysseusAuditBot/0.1 (+https://odysseus.example/bot)';

/** Hard per-page timeout in ms, applied independently to each pass. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Single choke point for launching Chromium, so later scanners (axe,
 * Lighthouse) can extend it to reuse the same browser instance without
 * touching call sites.
 */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch();
}
