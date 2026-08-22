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
export const DEFAULT_MAX_PAGES = 20;
export const DEFAULT_MAX_CRAWL_DEPTH = 5;
export const DEFAULT_CRAWL_DELAY_MS = 1000;
export const DEFAULT_PAGE_TIMEOUT_MS = 30_000;
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

export function getLighthouseTimeoutMs(): number {
  return getPositiveIntEnv('LIGHTHOUSE_TIMEOUT_MS', DEFAULT_LIGHTHOUSE_TIMEOUT_MS);
}

export function getScanConcurrency(): number {
  return getPositiveIntEnv('SCAN_CONCURRENCY', DEFAULT_SCAN_CONCURRENCY);
}

/**
 * Single source of truth for the bot's identity. render-diff and the
 * crawler both call this rather than reading ODYSSEUS_USER_AGENT
 * directly, so one env var controls what every scan sends.
 */
export function getCrawlerUserAgent(): string {
  ensureEnvLoaded();
  return process.env.CRAWLER_USER_AGENT || ODYSSEUS_USER_AGENT;
}

/** Milestone 8.6. Returns undefined (not empty string) when unset, so
 *  callers can gate the CrUX fetch on presence with a plain truthiness
 *  check rather than comparing against ''. Generate a key at
 *  https://goo.gle/crux-api-key. */
export function getCruxApiKey(): string | undefined {
  ensureEnvLoaded();
  return process.env.CRUX_API_KEY || undefined;
}
