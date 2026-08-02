import { chromium, type Browser } from 'playwright';

/**
 * Identifies Odysseus per the crawling-politeness rule. Swap the contact
 * URL for a real one before running against anything but a local fixture.
 */
export const ODYSSEUS_USER_AGENT =
  'OdysseusAuditBot/0.1 (+https://odysseus.example/bot)';

/** Hard per-page timeout in ms, applied independently to each pass. */
export const DEFAULT_TIMEOUT_MS = 30_000;

export const DEFAULT_SCREENSHOT_DIR = 'artifacts/render-diff';

/**
 * Single choke point for launching Chromium, so later scanners (axe,
 * Lighthouse) can extend it to reuse the same browser instance without
 * touching call sites.
 */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch();
}
