import path from 'node:path';
import { ensureEnvLoaded, findWorkspaceRoot } from '@odysseus/scanner';

export const DEFAULT_INTERFACE_PORT = 4600;
/** Binds to loopback only by default: this is what makes the dashboard a
 *  *private* interface rather than the "public web interface" CLAUDE.md
 *  says isn't being built. Reachable from another machine only if the
 *  operator deliberately tunnels to it themselves. */
export const DEFAULT_INTERFACE_HOST = '127.0.0.1';
/** Each concurrent job needs its own Chromium + Lighthouse CDP pairing
 *  (see browser.ts); default 1 is the safe floor for a solo operator's
 *  own machine, per CLAUDE.md's "cap concurrency, provision for what the
 *  machine can host" guidance. 2 is offered, not recommended, for a
 *  machine known to have the memory to spare. */
export const DEFAULT_QUEUE_CONCURRENCY = 1;
/** Milestone 9b: raised from the milestone-7 homepage-only pass (1 page,
 *  depth 0) to 3 pages at depth 1, per docs/odysseus-project-brief-v2.md's
 *  9b description ("home, one listing page, one transactional page, the
 *  last retained because the flow detector needs it"). This is a page
 *  *count* ceiling, not a page-role classifier: the crawl still discovers
 *  pages in ordinary link order, so "the second and third page scanned"
 *  are whichever the crawl reaches first at depth 1, not a guaranteed
 *  listing/transactional pair. Building an actual page-role classifier
 *  (matching link text/URL patterns for a menu, room list, or booking
 *  page) is a real gap, not solved here - flagged rather than
 *  quietly assumed solved. This ceiling is enforced server-side
 *  regardless of what a request asks for. */
export const PROSPECTING_MAX_PAGES = 3;
export const PROSPECTING_MAX_DEPTH = 1;

/** Milestone 9b: bounded worker pool size for runProspectingJob - how
 *  many distinct origins are scanned concurrently within one batch. Safe
 *  because the per-origin lock (originLock) already serializes requests
 *  within one origin and the crawl-delay politeness budget is per origin,
 *  not global - concurrent origins never contend for the same rate
 *  limit. Kept separate from DEFAULT_QUEUE_CONCURRENCY (which governs how
 *  many *jobs* run at once): this is concurrency *within* one prospecting
 *  job's own URL list. */
export const PROSPECTING_JOB_CONCURRENCY = 3;

/** Milestone 9a: one prospect-ingestion job processes one bounded batch
 *  of AFNIC candidates, resuming from a persisted checkpoint - not one
 *  unbounded job. See packages/interface/src/queue/pipeline/
 *  run-prospect-ingestion-job.ts. */
export const DEFAULT_PROSPECT_BATCH_SIZE = 2_000;
/** Timeout for each of the prospecting cheap-fetch stage's plain HTTP
 *  requests (homepage, mentions-legales) - not the scanner's Chromium
 *  page timeout, which this stage never uses. */
export const DEFAULT_PROSPECT_FETCH_TIMEOUT_MS = 15_000;
/** How often (in candidates processed) run-prospect-ingestion-job.ts
 *  persists its resume checkpoint, plus once more at batch end. A crash
 *  mid-batch loses at most this many candidates' worth of re-fetching,
 *  not the whole batch - a deliberate trade-off of extra Mongo writes
 *  for crash resilience. */
export const PROSPECT_CHECKPOINT_WRITE_INTERVAL = 100;

export function getInterfacePort(): number {
  ensureEnvLoaded();
  const raw = process.env['ODYSSEUS_INTERFACE_PORT'];
  if (!raw) return DEFAULT_INTERFACE_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERFACE_PORT;
}

export function getInterfaceHost(): string {
  ensureEnvLoaded();
  return process.env['ODYSSEUS_INTERFACE_HOST'] || DEFAULT_INTERFACE_HOST;
}

export function getQueueConcurrency(): number {
  ensureEnvLoaded();
  const raw = process.env['QUEUE_CONCURRENCY'];
  if (!raw) return DEFAULT_QUEUE_CONCURRENCY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUEUE_CONCURRENCY;
}

/** Multi-gigabyte, operator-downloaded source files (AFNIC ~0.45GB,
 *  Sirene stock several GB) - a top-level, gitignored data/ directory,
 *  kept separate from artifacts/ (already gitignored) since these are
 *  operator-placed *inputs*, not tool-generated output. */
export function getAfnicFichierAPath(): string {
  ensureEnvLoaded();
  const configured = process.env['ODYSSEUS_AFNIC_FILE_PATH'];
  if (configured) return path.resolve(findWorkspaceRoot(), configured);
  return path.join(findWorkspaceRoot(), 'data', 'afnic', 'fichier-a.csv');
}

export function getSireneStockPath(): string {
  ensureEnvLoaded();
  const configured = process.env['ODYSSEUS_SIRENE_STOCK_PATH'];
  if (configured) return path.resolve(findWorkspaceRoot(), configured);
  return path.join(findWorkspaceRoot(), 'data', 'sirene', 'stock-unite-legale.csv');
}

export function getSireneStockIndexCachePath(): string {
  return path.join(findWorkspaceRoot(), 'data', 'sirene', 'stock-index-cache.jsonl');
}

export function getProspectBatchSize(): number {
  ensureEnvLoaded();
  const raw = process.env['ODYSSEUS_PROSPECT_BATCH_SIZE'];
  if (!raw) return DEFAULT_PROSPECT_BATCH_SIZE;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROSPECT_BATCH_SIZE;
}

/** Anchored to the workspace root (not to this module's own depth on
 *  disk), so it resolves identically whether the server runs via `tsx
 *  src/index.ts` (dev) or the compiled `dist/index.js` (prod) - both sit
 *  at different depths relative to `src/public`, but findWorkspaceRoot
 *  doesn't care which one is running. */
export function getPublicDir(): string {
  return path.join(findWorkspaceRoot(), 'packages', 'interface', 'dist', 'public');
}
