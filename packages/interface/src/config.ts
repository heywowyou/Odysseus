import path from 'node:path';
import { ensureEnvLoaded, findWorkspaceRoot, readOdysseusBuildId } from '@odysseus/scanner';
import { FIRST_OUTREACH_CAMPAIGN_VERSION, OUTREACH_CONTACT } from '@odysseus/core';

const DEFAULT_INTERFACE_PORT = 4600;
/** Binds to loopback only by default: this is what makes the dashboard a
 *  *private* interface rather than the "public web interface" CLAUDE.md
 *  says isn't being built. Reachable from another machine only if the
 *  operator deliberately tunnels to it themselves. */
const DEFAULT_INTERFACE_HOST = '127.0.0.1';
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
 *  listing/transactional pair. This ceiling is enforced server-side
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
/** Timeout for each of the prospecting cheap-fetch stage's plain HTTP
 *  requests (homepage, mentions-legales) - not the scanner's Chromium
 *  page timeout, which this stage never uses. */
export const DEFAULT_PROSPECT_FETCH_TIMEOUT_MS = 15_000;
/** Issue #158 (posture approved 2026-09-10): the prospecting fetch helpers
 *  (probeUrl, fetchPageText) resolve every request host, initial or
 *  redirected, and refuse answers on loopback, private, link-local or
 *  unique-local addresses, so a prospect URL cannot probe the deployment's
 *  own compose network. This comma-separated list is the operator's only
 *  way back in, meant for local smoke against fixture servers. Entries are
 *  hostnames or literal IPs matched against the URL host exactly
 *  (case-insensitive, brackets stripped from IPv6 literals) and they bypass
 *  both resolution and the address check for that host. Production keeps
 *  this unset: anyone who can set it can re-open the hole the guard closes. */
export const PROSPECT_FETCH_ALLOWLIST_ENV_VAR = 'ODYSSEUS_PROSPECT_FETCH_ALLOWLIST';

/** Reads the allowlist fresh on every call, so a request picks up operator
 *  edits without a restart and tests can scope it to a single case. */
export function getProspectFetchAllowlist(): ReadonlySet<string> {
  ensureEnvLoaded();
  const raw = process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
  if (raw === undefined || raw.trim() === '') return new Set<string>();
  return new Set(
    raw
      .split(',')
      .map((entry) => {
        const trimmed = entry.trim().toLowerCase();
        return trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
      })
      .filter((entry) => entry !== ''),
  );
}
/** How often (in URLs completed) run-prospecting-job.ts writes its
 *  progress document, plus once more at job end via completeJob. Progress
 *  writes replace the entire urlResults array (see UrlResult and
 *  updateJobProgress) rather than patching one element, so writing on
 *  every URL scales the write payload with the job size - same
 *  checkpoint-interval idea as PROSPECT_CHECKPOINT_WRITE_INTERVAL, applied
 *  to progress telemetry instead of resume state. */
export const PROSPECTING_PROGRESS_WRITE_INTERVAL = 10;

/** Plan 016: the dashboard's single password, configured only as a scrypt
 *  `<hexSalt>:<hexHash>` string produced by
 *  scripts/hash-dashboard-password.mjs; the plaintext never enters the
 *  environment. Blank means no auth: the server then keeps its historical
 *  no-auth behaviour but refuses any non-loopback bind (see
 *  startInterfaceServer). */
export const DASHBOARD_PASSWORD_HASH_ENV_VAR = 'ODYSSEUS_DASHBOARD_PASSWORD_HASH';

export function getDashboardPasswordHash(): string | null {
  ensureEnvLoaded();
  const raw = process.env[DASHBOARD_PASSWORD_HASH_ENV_VAR];
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export function getInterfacePort(): number {
  ensureEnvLoaded();
  const raw = process.env['ODYSSEUS_INTERFACE_PORT'];
  if (!raw) return DEFAULT_INTERFACE_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERFACE_PORT;
}

/** The host names, besides loopback, the dashboard answers to (issue #546):
 *  `ODYSSEUS_PUBLIC_HOST`, comma-separated. Production sets the name Caddy
 *  serves; a local `odysseus serve` leaves it unset. */
export function getDashboardPublicHosts(): string[] {
  ensureEnvLoaded();
  return (process.env['ODYSSEUS_PUBLIC_HOST'] ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

export function getInterfaceHost(): string {
  ensureEnvLoaded();
  return process.env['ODYSSEUS_INTERFACE_HOST'] || DEFAULT_INTERFACE_HOST;
}

export interface DeployMetadata {
  /** ODYSSEUS_BUILD_ID (git short SHA the image was built from) via
   *  readOdysseusBuildId, or its 'unknown' sentinel outside a stamped
   *  deploy. Never undefined - only allowlisted build identity, no
   *  secrets or environment dump. */
  revision: string;
  /** ODYSSEUS_BUILT_AT, stamped the same way as ODYSSEUS_BUILD_ID; null
   *  when the image was not built with that stamp (issue: expose build
   *  revision - absence degrades to an explicit null, not a failure). */
  builtAt: string | null;
  /** NODE_ENV, or 'development' when unset - never a hostname, secret, or
   *  full environment dump. */
  environment: string;
}

export function getDeployMetadata(): DeployMetadata {
  ensureEnvLoaded();
  const builtAt = process.env['ODYSSEUS_BUILT_AT']?.trim();
  return {
    revision: readOdysseusBuildId(),
    builtAt: builtAt ? builtAt : null,
    environment: process.env['NODE_ENV']?.trim() || 'development',
  };
}

export function getQueueConcurrency(): number {
  ensureEnvLoaded();
  const raw = process.env['QUEUE_CONCURRENCY'];
  if (!raw) return DEFAULT_QUEUE_CONCURRENCY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUEUE_CONCURRENCY;
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

/** A separate cache file for milestone 10's benchmark cohort, built under a
 *  benchmark-scoped NAF filter (division 47, not the outreach allowlist).
 *  Never the same path as getSireneStockIndexCachePath(): the cache is
 *  fingerprinted only against the stock file, not against which filter
 *  built it, so sharing a path would silently mix the two row sets. */
export function getBenchmarkSireneStockIndexCachePath(): string {
  return path.join(findWorkspaceRoot(), 'data', 'sirene', 'benchmark-stock-index-cache.jsonl');
}

/** Milestone 9c plan 012: the canonical touch spacing, per
 *  `docs/rules/outreach-rules.md` section 6 (E1 day 0, E2 no earlier than day
 *  +4, E3 no earlier than day +11) and the 14-day reply window before a
 *  completed sequence is closed. Written onto each thread as a snapshot when
 *  it opens (`OutreachThreadSpacing`), never read live at due-date check time,
 *  so a later change to these defaults cannot retroactively redate a thread
 *  already in flight. */
const DEFAULT_OUTREACH_TOUCH2_AFTER_DAYS = 4;
const DEFAULT_OUTREACH_TOUCH3_AFTER_DAYS = 11;
const DEFAULT_OUTREACH_REPLY_WINDOW_DAYS = 14;

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

/** Issue #533: the campaign a newly opened outreach thread is stamped with.
 *  Set a new value when a new batch starts or anything the prospect receives
 *  changes (email template, preview content, evidence version, spacing). */
export function getOutreachCampaignVersion(): string {
  ensureEnvLoaded();
  const configured = process.env['ODYSSEUS_OUTREACH_CAMPAIGN_VERSION']?.trim();
  return configured === undefined || configured === ''
    ? FIRST_OUTREACH_CAMPAIGN_VERSION
    : configured;
}

/** Anchored to the workspace root (not to this module's own depth on
 *  disk), so it resolves identically whether the server runs via `tsx
 *  src/index.ts` (dev) or the compiled `dist/index.js` (prod) - both sit
 *  at different depths relative to the built dashboard, but
 *  findWorkspaceRoot doesn't care which one is running. */
export function getPublicDir(): string {
  return path.join(findWorkspaceRoot(), 'packages', 'interface', 'dist', 'public');
}

/** Milestone 9c plan 009: the private bucket outreach previews are published
 *  to. Scaleway Object Storage in `fr-par`, chosen because this bucket is a
 *  named recipient on the prospecting privacy page and a French host in a
 *  French region is the shortest truthful sentence to write there; it is plain
 *  S3, so the choice is reversible in configuration alone. */
const DEFAULT_PREVIEW_BUCKET_ENDPOINT = 'https://s3.fr-par.scw.cloud';
const DEFAULT_PREVIEW_BUCKET_REGION = 'fr-par';
/** `www`, deliberately. The apex 308-redirects to it, and a redirect would
 *  carry a live preview token through a second host's request log. */
const DEFAULT_PREVIEW_PUBLIC_BASE_URL = 'https://www.odysseusaudit.com';

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

/** Plan 071: the permanent reference report keeps its own object namespace,
 *  `reference-audit/`, and may keep its own credentials. When no dedicated
 *  bucket is configured it falls back to the preview bucket, which is safe
 *  because nothing sweeps that bucket wholesale: preview cleanup deletes the
 *  one object it published, and the opt-out poller is scoped to
 *  `opt-out-requests/`. A dedicated bucket remains preferable when the public
 *  site's read credential should not reach preview objects at all. */
function referenceAuditEnv(name: string, fallback: () => string): string {
  ensureEnvLoaded();
  const value = process.env[name];
  if (value === undefined || value === '') return fallback();
  return value;
}

export function getReferenceAuditBucketEndpoint(): string {
  return referenceAuditEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_ENDPOINT', getPreviewBucketEndpoint);
}

export function getReferenceAuditBucketRegion(): string {
  return referenceAuditEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_REGION', getPreviewBucketRegion);
}

export function getReferenceAuditBucketName(): string {
  return referenceAuditEnv('ODYSSEUS_REFERENCE_AUDIT_BUCKET_NAME', getPreviewBucketName);
}

export function getReferenceAuditBucketAccessKeyId(): string {
  return referenceAuditEnv(
    'ODYSSEUS_REFERENCE_AUDIT_BUCKET_ACCESS_KEY_ID',
    getPreviewBucketAccessKeyId,
  );
}

export function getReferenceAuditBucketSecretAccessKey(): string {
  return referenceAuditEnv(
    'ODYSSEUS_REFERENCE_AUDIT_BUCKET_SECRET_ACCESS_KEY',
    getPreviewBucketSecretKey,
  );
}

export function isReferenceAuditBucketConfigured(): boolean {
  ensureEnvLoaded();
  const dedicated =
    Boolean(process.env['ODYSSEUS_REFERENCE_AUDIT_BUCKET_NAME']) &&
    Boolean(process.env['ODYSSEUS_REFERENCE_AUDIT_BUCKET_ACCESS_KEY_ID']) &&
    Boolean(process.env['ODYSSEUS_REFERENCE_AUDIT_BUCKET_SECRET_ACCESS_KEY']);
  const sharedWithPreviews =
    Boolean(process.env['ODYSSEUS_PREVIEW_BUCKET_NAME']) &&
    Boolean(process.env['ODYSSEUS_PREVIEW_BUCKET_ACCESS_KEY_ID']) &&
    Boolean(process.env['ODYSSEUS_PREVIEW_BUCKET_SECRET_KEY']);
  return dedicated || sharedWithPreviews;
}

/** Optional private consumer credentials for the public site's write-only
 *  receipt prefix. They are separate from the publication reader/writer so a
 *  public deployment credential cannot list or replace the approved PDF. */
function requiredReferenceReceiptEnv(name: string): string {
  ensureEnvLoaded();
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set; reference audit receipt polling needs it`);
  }
  return value;
}

export function getReferenceAuditReceiptBucketEndpoint(): string {
  return requiredReferenceReceiptEnv('ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_ENDPOINT');
}

export function getReferenceAuditReceiptBucketRegion(): string {
  return requiredReferenceReceiptEnv('ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_REGION');
}

export function getReferenceAuditReceiptBucketName(): string {
  return requiredReferenceReceiptEnv('ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_NAME');
}

export function getReferenceAuditReceiptBucketAccessKeyId(): string {
  return requiredReferenceReceiptEnv('ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_ACCESS_KEY_ID');
}

export function getReferenceAuditReceiptBucketSecretKey(): string {
  return requiredReferenceReceiptEnv('ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_SECRET_KEY');
}

function isReferenceAuditReceiptBucketConfigured(): boolean {
  ensureEnvLoaded();
  return (
    Boolean(process.env['ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_ENDPOINT']) &&
    Boolean(process.env['ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_REGION']) &&
    Boolean(process.env['ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_NAME']) &&
    Boolean(process.env['ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_ACCESS_KEY_ID']) &&
    Boolean(process.env['ODYSSEUS_REFERENCE_AUDIT_RECEIPT_BUCKET_SECRET_KEY'])
  );
}

/** Touch 1 links to the plain public `/exemple-audit` page by default. The
 *  opaque `/exemple-audit/r/<token>` attribution link is opt-in
 *  (`ODYSSEUS_REFERENCE_AUDIT_LINK_TRACKING=on`, plus the receipt bucket):
 *  since 2026-09-21 the operator prefers a readable, untracked address in a
 *  cold email, both for the recipient's trust and for deliverability. */
export function isReferenceAuditLinkTrackingEnabled(): boolean {
  ensureEnvLoaded();
  return (
    process.env['ODYSSEUS_REFERENCE_AUDIT_LINK_TRACKING'] === 'on' &&
    isReferenceAuditReceiptBucketConfigured()
  );
}

export function getReferenceAuditPublicBaseUrl(): string {
  ensureEnvLoaded();
  return process.env['ODYSSEUS_REFERENCE_AUDIT_PUBLIC_BASE_URL'] ?? getPreviewPublicBaseUrl();
}

/** Issue #63: the bucket audit artifacts and rendered reports are synced
 *  to, so a job run or read on a different machine (or after a fresh
 *  deploy) is never stuck with a database row and no local file. A new,
 *  dedicated bucket, not `ODYSSEUS_PREVIEW_BUCKET_*` above - see
 *  scaleway-artifact-store.ts's doc comment for why the two must not
 *  share one. No default endpoint/region constant the way the preview
 *  bucket has one: this bucket is not provisioned yet as of this issue
 *  (see the plan's "not in scope" list), so a guessed default would look
 *  configured when it is not. */
function requiredArtifactsBucketEnv(name: string): string {
  ensureEnvLoaded();
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set; artifact bucket sync needs it`);
  }
  return value;
}

export function getArtifactsBucketEndpoint(): string {
  return requiredArtifactsBucketEnv('ODYSSEUS_ARTIFACTS_BUCKET_ENDPOINT');
}

export function getArtifactsBucketRegion(): string {
  return requiredArtifactsBucketEnv('ODYSSEUS_ARTIFACTS_BUCKET_REGION');
}

export function getArtifactsBucketName(): string {
  return requiredArtifactsBucketEnv('ODYSSEUS_ARTIFACTS_BUCKET_NAME');
}

export function getArtifactsBucketAccessKeyId(): string {
  return requiredArtifactsBucketEnv('ODYSSEUS_ARTIFACTS_BUCKET_ACCESS_KEY_ID');
}

export function getArtifactsBucketSecretAccessKey(): string {
  return requiredArtifactsBucketEnv('ODYSSEUS_ARTIFACTS_BUCKET_SECRET_ACCESS_KEY');
}

/** True only when every credential is actually set, so a caller can decide
 *  to skip sync entirely on a machine with no bucket configured yet
 *  (development, or before the real bucket is provisioned) instead of
 *  throwing out of an upload hook that runs on every job. */
export function isArtifactsBucketConfigured(): boolean {
  ensureEnvLoaded();
  return (
    Boolean(process.env['ODYSSEUS_ARTIFACTS_BUCKET_ENDPOINT']) &&
    Boolean(process.env['ODYSSEUS_ARTIFACTS_BUCKET_REGION']) &&
    Boolean(process.env['ODYSSEUS_ARTIFACTS_BUCKET_NAME']) &&
    Boolean(process.env['ODYSSEUS_ARTIFACTS_BUCKET_ACCESS_KEY_ID']) &&
    Boolean(process.env['ODYSSEUS_ARTIFACTS_BUCKET_SECRET_ACCESS_KEY'])
  );
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
 * plan 011's operator preflight. `getMailboxSenderAddress` enforces it: the
 * configured sender must be `OUTREACH_CONTACT.address`, the one address every
 * draft and preview names, or nothing mailbox-related runs. A draft sent from
 * one address while its body names another would tell the prospect to object
 * to a mailbox the campaign does not read.
 */
const MAILBOX_ENV_VARS = [
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
  const address = requiredMailboxEnv('ODYSSEUS_MAILBOX_SENDER_ADDRESS');
  if (address.trim().toLowerCase() !== OUTREACH_CONTACT.address) {
    // Names the expected address only, never the configured value.
    throw new Error(
      `ODYSSEUS_MAILBOX_SENDER_ADDRESS must be ${OUTREACH_CONTACT.address}, the address ` +
        'every outreach draft and preview names; outreach draft creation refuses otherwise',
    );
  }
  return OUTREACH_CONTACT.address;
}
