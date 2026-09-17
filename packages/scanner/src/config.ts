import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ODYSSEUS_USER_AGENT } from './browser.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walks up from this module's own location (not process.cwd(), which
 * varies with wherever the CLI happens to be invoked from) to find the
 * workspace root. Works identically whether running from src/ (tsx) or
 * dist/ (built), since both sit at the same depth under the root.
 */
export function findWorkspaceRoot(): string {
  let dir = moduleDir;
  while (true) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(
        `odysseus: could not locate the workspace root (no pnpm-workspace.yaml found above ${moduleDir})`,
      );
    }
    dir = parent;
  }
}

let envLoaded = false;

export function ensureEnvLoaded(): void {
  if (envLoaded) return;
  envLoaded = true;
  try {
    process.loadEnvFile(path.join(findWorkspaceRoot(), '.env'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export const DEFAULT_ARTIFACTS_DIR_NAME = 'artifacts';
/** Sentinel meaning "crawl until the frontier is exhausted". A real
 *  number rather than Infinity so it survives JSON round-tripping into the
 *  manifest and Mongoose's Number schema unchanged; callers that do
 *  arithmetic on maxPages (queue/eta.ts) special-case it. */
export const UNLIMITED_MAX_PAGES = Number.MAX_SAFE_INTEGER;

/** Changed 2026-08-24 from a hard 20 to no default limit, an explicit
 *  operator decision recorded in CLAUDE.md rule 5: a paid audit is sold as
 *  covering the client's site, and a silent cap made a real 65-page site
 *  look like a 20-page one. A limit is now opt-in, via --max-pages or
 *  MAX_PAGES, and the report already discloses when a configured cap
 *  actually bound the crawl (methodology.ts's crawlCapDisclosureTemplate).
 *
 *  Politeness is unaffected: it is carried by the per-request delay, which
 *  is unchanged, not by the page count. The residual risk this accepts is
 *  an effectively infinite URL space (calendars, faceted filters), which
 *  no trap detector currently guards against - crawl a site of unknown
 *  shape with an explicit --max-pages until one exists. */
export const DEFAULT_MAX_PAGES = UNLIMITED_MAX_PAGES;
export const DEFAULT_MAX_CRAWL_DEPTH = 5;
export const DEFAULT_CRAWL_DELAY_MS = 1000;
export const DEFAULT_PAGE_TIMEOUT_MS = 30_000;
/** How long the rendered pass waits for the network to fall idle *after*
 *  `load` has already fired, before giving up and measuring anyway.
 *  Bounded because `networkidle` is not merely slow on some real sites,
 *  it is unreachable: a chat widget, analytics heartbeat, or autoplaying
 *  video keeps a request in flight forever. Confirmed against
 *  www.lagnonu.fr on 2026-08-24, which never settled in 120s while its
 *  visible text was complete at 4.3s, and whose whole audit lost
 *  render-diff, axe, and every onRenderedPage custom check as a result.
 *  Waiting is still worth attempting: a slow client-rendered SPA can
 *  genuinely still be painting when `load` fires, and measuring then
 *  would overstate missingPercent. */
export const DEFAULT_RENDER_SETTLE_TIMEOUT_MS = 8_000;
/** Lighthouse's own navigation-mode run routinely runs well past a single
 *  page's load timeout, since it collects a full trace across throttled
 *  network/CPU simulation on top of the audits themselves. Raised from
 *  60s during the P0.1 investigation (2026-08-21 La Corniche feedback
 *  pass): a real lacoorniche.com page (booking widget, Popup Maker modal,
 *  Complianz cookie consent, all loading under Lighthouse's own simulated
 *  mobile/throttled network) took ~106s end to end, confirmed by running
 *  it standalone with a raised timeout - not a hang, genuinely that slow
 *  under throttled conditions. 60s was cutting off legitimate real-site
 *  runs, not just broken ones. */
export const DEFAULT_LIGHTHOUSE_TIMEOUT_MS = 120_000;
/** Number of pages the scan phase (render-diff + axe + Lighthouse) processes
 *  at once. Each lane keeps the same CRAWL_DELAY_MS pacing it always had;
 *  this only adds lanes, it never shortens the delay between requests. The
 *  crawl (link-discovery) phase is unaffected and stays sequential. */
export const DEFAULT_SCAN_CONCURRENCY = 3;

/**
 * Single configured root for everything the scanner writes to disk, so a
 * stored ref (e.g. RenderDiffResult.rawScreenshotRef) points to the same
 * place regardless of the cwd the CLI was invoked from.
 */
export function getArtifactsRoot(): string {
  ensureEnvLoaded();
  const configured = process.env.ODYSSEUS_ARTIFACTS_ROOT;
  const workspaceRoot = findWorkspaceRoot();
  if (configured) return path.resolve(workspaceRoot, configured);
  return path.join(workspaceRoot, DEFAULT_ARTIFACTS_DIR_NAME);
}

function getPositiveIntEnv(name: string, defaultValue: number): number {
  ensureEnvLoaded();
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function getMaxPages(): number {
  return getPositiveIntEnv('MAX_PAGES', DEFAULT_MAX_PAGES);
}

export function getMaxCrawlDepth(): number {
  return getPositiveIntEnv('MAX_CRAWL_DEPTH', DEFAULT_MAX_CRAWL_DEPTH);
}

export function getCrawlDelayMs(): number {
  return getPositiveIntEnv('CRAWL_DELAY_MS', DEFAULT_CRAWL_DELAY_MS);
}

export function getPageTimeoutMs(): number {
  return getPositiveIntEnv('PAGE_TIMEOUT_MS', DEFAULT_PAGE_TIMEOUT_MS);
}

export function getRenderSettleTimeoutMs(): number {
  return getPositiveIntEnv('RENDER_SETTLE_TIMEOUT_MS', DEFAULT_RENDER_SETTLE_TIMEOUT_MS);
}

export function getLighthouseTimeoutMs(): number {
  return getPositiveIntEnv('LIGHTHOUSE_TIMEOUT_MS', DEFAULT_LIGHTHOUSE_TIMEOUT_MS);
}

export function getScanConcurrency(): number {
  return getPositiveIntEnv('SCAN_CONCURRENCY', DEFAULT_SCAN_CONCURRENCY);
}

/**
 * Single source of truth for the bot's identity. The identity is fixed in
 * code on purpose (trade-offs): site owners write robots.txt rules against
 * the name the public /bot page publishes, so an environment override could
 * silently send a name their rules miss. Changing it means changing the
 * public /bot page and /llms.txt in the same release.
 */
export function getCrawlerUserAgent(): string {
  return ODYSSEUS_USER_AGENT;
}

/** Milestone 8.6. Returns undefined (not empty string) when unset, so
 *  callers can gate the CrUX fetch on presence with a plain truthiness
 *  check rather than comparing against ''. Generate a key at
 *  https://goo.gle/crux-api-key. */
export function getCruxApiKey(): string | undefined {
  ensureEnvLoaded();
  return process.env.CRUX_API_KEY || undefined;
}
