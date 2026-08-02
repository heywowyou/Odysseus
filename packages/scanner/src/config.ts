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

function ensureEnvLoaded(): void {
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
 *  network/CPU simulation on top of the audits themselves. */
export const DEFAULT_LIGHTHOUSE_TIMEOUT_MS = 60_000;

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

/**
 * Single source of truth for the bot's identity. render-diff and the
 * crawler both call this rather than reading ODYSSEUS_USER_AGENT
 * directly, so one env var controls what every scan sends.
 */
export function getCrawlerUserAgent(): string {
  ensureEnvLoaded();
  return process.env.CRAWLER_USER_AGENT || ODYSSEUS_USER_AGENT;
}
