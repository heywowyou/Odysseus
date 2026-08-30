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
 *  depth 0) to 3 pages at depth 1, per docs/product/odysseus-project-brief.md's
 *  9b description ("home, one listing page, one transactional page, the
 *  last retained because the flow detector needs it"). This is a page
 *  *count* ceiling, not a page-role classifier: the crawl still discovers
 *  pages in ordinary link order, so "the second and third page scanned"
 *  are whichever the crawl reaches first at depth 1, not a guaranteed
 *  listing/transactional pair. The page-role classifier this comment used
 *  to flag as an unsolved gap now exists as the prescan's
 *  selectPrescanPages (packages/scanner/src/prescan/page-roles.ts), which
 *  picks homepage/booking/content deliberately - but it belongs to the
 *  hotel-prescan path, not to this legacy prospecting crawl, whose
 *  link-order behaviour is left unchanged on purpose so its existing tests
 *  stay a regression guard. This ceiling is enforced server-side
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
/** How often (in URLs completed) run-prospecting-job.ts writes its
 *  progress document, plus once more at job end via completeJob. Progress
 *  writes replace the entire urlResults array (see UrlResult and
 *  updateJobProgress) rather than patching one element, so writing on
 *  every URL scales the write payload with the job size - same
 *  checkpoint-interval idea as PROSPECT_CHECKPOINT_WRITE_INTERVAL, applied
 *  to progress telemetry instead of resume state. */
export const PROSPECTING_PROGRESS_WRITE_INTERVAL = 10;

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

/** Milestone 9c hotel catalogue input, operator-downloaded into the same
 *  gitignored data/ root as AFNIC and Sirene. Published open data, regenerated
 *  daily, so the adapter reads whatever the operator last placed here and
 *  fingerprints it rather than fetching on its own. */
export function getAtoutFranceExportPath(): string {
  ensureEnvLoaded();
  const configured = process.env['ODYSSEUS_ATOUT_FRANCE_FILE_PATH'];
  if (configured) return path.resolve(findWorkspaceRoot(), configured);
  return path.join(findWorkspaceRoot(), 'data', 'atout-france', 'hebergements_classes.csv');
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

/** Milestone 9c plan 012: the canonical touch spacing, per
 *  `docs/rules/outreach-rules.md` section 6 (E1 day 0, E2 no earlier than day
 *  +4, E3 no earlier than day +11) and the 14-day reply window before a
 *  completed sequence is closed. Written onto each thread as a snapshot when
 *  it opens (`OutreachThreadSpacing`), never read live at due-date check time,
 *  so a later change to these defaults cannot retroactively redate a thread
 *  already in flight. */
export const DEFAULT_OUTREACH_TOUCH2_AFTER_DAYS = 4;
export const DEFAULT_OUTREACH_TOUCH3_AFTER_DAYS = 11;
export const DEFAULT_OUTREACH_REPLY_WINDOW_DAYS = 14;

function positiveIntEnv(name: string, fallback: number): number {
  ensureEnvLoaded();
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getOutreachTouch2AfterDays(): number {
  return positiveIntEnv('ODYSSEUS_OUTREACH_TOUCH2_DAYS', DEFAULT_OUTREACH_TOUCH2_AFTER_DAYS);
}

export function getOutreachTouch3AfterDays(): number {
  return positiveIntEnv('ODYSSEUS_OUTREACH_TOUCH3_DAYS', DEFAULT_OUTREACH_TOUCH3_AFTER_DAYS);
}

export function getOutreachReplyWindowDays(): number {
  return positiveIntEnv('ODYSSEUS_OUTREACH_REPLY_WINDOW_DAYS', DEFAULT_OUTREACH_REPLY_WINDOW_DAYS);
}

/** Anchored to the workspace root (not to this module's own depth on
 *  disk), so it resolves identically whether the server runs via `tsx
 *  src/index.ts` (dev) or the compiled `dist/index.js` (prod) - both sit
 *  at different depths relative to `src/public`, but findWorkspaceRoot
 *  doesn't care which one is running. */
export function getPublicDir(): string {
  return path.join(findWorkspaceRoot(), 'packages', 'interface', 'dist', 'public');
}

/** Milestone 9c plan 009: the private bucket outreach previews are published
 *  to. Scaleway Object Storage in `fr-par`, chosen because this bucket is a
 *  named recipient on the prospecting privacy page and a French host in a
 *  French region is the shortest truthful sentence to write there; it is plain
 *  S3, so the choice is reversible in configuration alone. */
export const DEFAULT_PREVIEW_BUCKET_ENDPOINT = 'https://s3.fr-par.scw.cloud';
export const DEFAULT_PREVIEW_BUCKET_REGION = 'fr-par';
/** `www`, deliberately. The apex 308-redirects to it, and a redirect would
 *  carry a live preview token through a second host's request log. */
export const DEFAULT_PREVIEW_PUBLIC_BASE_URL = 'https://www.odysseusaudit.com';

export function getPreviewBucketEndpoint(): string {
  ensureEnvLoaded();
  return process.env['ODYSSEUS_PREVIEW_BUCKET_ENDPOINT'] ?? DEFAULT_PREVIEW_BUCKET_ENDPOINT;
}

export function getPreviewBucketRegion(): string {
  ensureEnvLoaded();
  return process.env['ODYSSEUS_PREVIEW_BUCKET_REGION'] ?? DEFAULT_PREVIEW_BUCKET_REGION;
}

export function getPreviewPublicBaseUrl(): string {
  ensureEnvLoaded();
  return process.env['ODYSSEUS_PREVIEW_PUBLIC_BASE_URL'] ?? DEFAULT_PREVIEW_PUBLIC_BASE_URL;
}

/** These three have no default and throw when unset. A silent fallback would
 *  mean a publish command that looks configured, signs with an empty key and
 *  fails at the provider with a message about credentials rather than about
 *  this machine's `.env`. */
function requiredPreviewEnv(name: string): string {
  ensureEnvLoaded();
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set; outreach preview publication needs it`);
  }
  return value;
}

export function getPreviewBucketName(): string {
  return requiredPreviewEnv('ODYSSEUS_PREVIEW_BUCKET_NAME');
}

export function getPreviewBucketAccessKeyId(): string {
  return requiredPreviewEnv('ODYSSEUS_PREVIEW_BUCKET_ACCESS_KEY_ID');
}

export function getPreviewBucketSecretKey(): string {
  return requiredPreviewEnv('ODYSSEUS_PREVIEW_BUCKET_SECRET_KEY');
}

/**
 * Milestone 9c plan 011: the mailbox outreach drafts are prepared in.
 *
 * Four values, none with a default, and `isMailboxConfigured` reports on all
 * four together rather than letting a caller test one. With nothing
 * provisioned at the time this shipped, that is what makes production draft
 * creation structurally unreachable instead of merely unconfigured: the
 * factory cannot build a Gmail adapter, so the CLI falls back to the in-memory
 * one and says so, rather than constructing a half-credentialled client that
 * fails at Google with a message about tokens.
 *
 * The sending address is deliberately separate from `odysseusaudit.com`, per
 * plan 011's operator preflight. Nothing here enforces that, because the check
 * belongs where a person can see the answer: the preflight checklist in
 * `docs/rules/outreach-rules.md`.
 */
export const MAILBOX_ENV_VARS = [
  'ODYSSEUS_MAILBOX_CLIENT_ID',
  'ODYSSEUS_MAILBOX_CLIENT_SECRET',
  'ODYSSEUS_MAILBOX_REFRESH_TOKEN',
  'ODYSSEUS_MAILBOX_SENDER_ADDRESS',
] as const;

export function isMailboxConfigured(): boolean {
  ensureEnvLoaded();
  return MAILBOX_ENV_VARS.every((name) => {
    const value = process.env[name];
    return value !== undefined && value !== '';
  });
}

/** Which of the four are missing, so the operator is told what to set rather
 *  than that "the mailbox" is unconfigured. Never reports a value. */
export function missingMailboxEnvVars(): string[] {
  ensureEnvLoaded();
  return MAILBOX_ENV_VARS.filter((name) => {
    const value = process.env[name];
    return value === undefined || value === '';
  });
}

function requiredMailboxEnv(name: string): string {
  ensureEnvLoaded();
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set; outreach draft creation needs it`);
  }
  return value;
}

export function getMailboxClientId(): string {
  return requiredMailboxEnv('ODYSSEUS_MAILBOX_CLIENT_ID');
}

export function getMailboxClientSecret(): string {
  return requiredMailboxEnv('ODYSSEUS_MAILBOX_CLIENT_SECRET');
}

export function getMailboxRefreshToken(): string {
  return requiredMailboxEnv('ODYSSEUS_MAILBOX_REFRESH_TOKEN');
}

export function getMailboxSenderAddress(): string {
  return requiredMailboxEnv('ODYSSEUS_MAILBOX_SENDER_ADDRESS');
}
