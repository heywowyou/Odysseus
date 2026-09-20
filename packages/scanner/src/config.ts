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
/** Plan 072: where the operator's finalization working sets live. Separate
 *  from `artifacts/`, which holds what a scan produced: `reports/` holds what
 *  the operator did to a report afterwards, and every file in it is client
 *  data. Already in .gitignore alongside `*.pdf`. */
export const DEFAULT_REPORTS_DIR_NAME = 'reports';
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

/** The depth counterpart of UNLIMITED_MAX_PAGES, and the same sentinel trick
 *  for the same JSON/Mongoose reason. */
export const UNLIMITED_MAX_CRAWL_DEPTH = Number.MAX_SAFE_INTEGER;

/** Changed 2026-09-18 from a hard 5 to no default limit, for exactly the
 *  reason the page cap was removed above, and as an operator decision taken
 *  while implementing plan 059.
 *
 *  Removing the page cap in August closed one door and left this one open. A
 *  page omitted because the frontier reached depth 5 is just as missing from a
 *  paid audit as one omitted at page 20, and it was missing more quietly,
 *  because nothing disclosed a depth bound the way crawlCapDisclosureTemplate
 *  discloses a page cap. Plan 059 section 3.3 makes the two the same truth
 *  problem and refuses to call an audit complete when either bound cut it.
 *
 *  Keeping the default at 5 would have meant a deep site producing no report
 *  at all once that rule is enforced, which is honest but useless. A limit is
 *  now opt-in via --max-depth or MAX_CRAWL_DEPTH, and a bound the operator
 *  actually set is disclosable rather than blocking (see
 *  isScopeTruncationDisclosable in @odysseus/core).
 *
 *  This inherits the page cap's residual risk unchanged and makes it slightly
 *  sharper: an effectively infinite URL space is now bounded only by the
 *  continuation guard. Crawl a site of unknown shape with an explicit bound. */
export const DEFAULT_MAX_CRAWL_DEPTH = UNLIMITED_MAX_CRAWL_DEPTH;
/** Changed 2026-09-18 from 1000 as part of plan 059 decision 18, which makes
 *  one host-wide scheduler (host-request-scheduler.ts) the only thing allowed
 *  to start a request against the audited site. The number moved because its
 *  meaning moved: it used to be a delay each pacer applied to its own lane,
 *  and it is now a single global ceiling on how often any lane may start.
 *
 *  333ms is chosen to keep the host's experience unchanged, not to be politer
 *  or faster. The scan phase already ran DEFAULT_SCAN_CONCURRENCY = 3 lanes,
 *  each sleeping its own 1000ms, so a site already saw roughly three
 *  navigations a second during the phase that dominates an audit. One global
 *  ceiling of 333ms reproduces that same ~3/s and nothing more. Keeping 1000ms
 *  as a global ceiling would have silently made every audit three times slower
 *  than the one that has been running against real client sites, which is a
 *  different decision from the one this plan asked for.
 *
 *  Be clear about what this does and does not bound. The scheduler paces
 *  navigations the scanner itself initiates. It does not pace the subresources
 *  a page pulls once it is loading, nor the requests a Lighthouse run issues
 *  inside its own navigation, so this is a ceiling on crawler-initiated
 *  requests and never a ceiling on total traffic reaching the host. A site
 *  that answers one navigation with eighty asset requests still receives
 *  eighty asset requests.
 *
 *  Plan 059 wiring now routes the raw page start, rendered navigation,
 *  serialized Lighthouse navigation, robots/sitemap setup, llms.txt, security
 *  headers and the consent homepage navigation through the same scheduler.
 *  Inner navigations use `pace()` so they do not deadlock by trying to acquire
 *  a second lane while their page already owns one.
 *
 *  The 333ms floor therefore applies once, globally, to scanner-initiated
 *  requests against the audited host. A stricter robots Crawl-delay still
 *  raises the scheduler and rate-limit feedback can only slow it further. */
export const DEFAULT_CRAWL_DELAY_MS = 333;
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
 *  at once. Since plan 059 decision 18 the lanes no longer carry their own
 *  pacing: they all take their turn from the run's single HostRequestScheduler,
 *  so raising this buys overlapping render/axe/Lighthouse work and never buys
 *  a higher request rate. It is also the scheduler's concurrency bound, which
 *  the scheduler may lower on its own after a rate-limit signal. The crawl
 *  (link-discovery) phase is unaffected and stays sequential. */
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

/**
 * Single configured root for the finalization working sets, resolved the same
 * way as `getArtifactsRoot` so `odysseus report:finalize` writes to the same
 * place regardless of the cwd it was invoked from.
 */
export function getReportsRoot(): string {
  ensureEnvLoaded();
  const configured = process.env.ODYSSEUS_REPORTS_ROOT;
  const workspaceRoot = findWorkspaceRoot();
  if (configured) return path.resolve(workspaceRoot, configured);
  return path.join(workspaceRoot, DEFAULT_REPORTS_DIR_NAME);
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
