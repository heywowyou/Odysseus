import type { Connection } from 'mongoose';
import { isHttpUrlWithoutCredentials, isValidSiren } from '@odysseus/core';
import {
  ActiveJobSlotTakenError,
  cancelJob,
  cancelQueuedJobs,
  createJob,
  deleteAuditCascade,
  deleteJob,
  checkScanLaunch,
  findProspectsByDomain,
  getAudit,
  getProspectHub,
  getProspectNames,
  getJob,
  listJobs,
  canonicalJobTypeForScanIntent,
  displayJobIntent,
  type JobDocument,
  type JobOptionsSnapshot,
  registrableDomainForScan,
} from '@odysseus/store';
import { getArtifactsRoot } from '@odysseus/scanner';
import type { Router } from '../router.js';
import {
  AuditArtifactDeletionError,
  deleteAuditArtifacts,
} from '../artifacts/delete-audit-artifacts.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { jsonBodyNotRead, readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';
import type { JobQueue } from '../queue/job-queue.js';
import { getSeverityRollupsForPoll } from './severity-rollup-cache.js';
import { logJobCreated } from '../request-context.js';

/** Minimal glob shape check, not a compiler: routes/scans.ts's boundary
 *  only needs to reject garbage early (rule: fail fast at the boundary,
 *  same as siren), the actual matching happens in links.ts. Rejects
 *  empty strings and control characters; otherwise permissive. */
function isPlausibleGlob(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x1f]/.test(value);
}

/** Thrown at this route's boundary so a bad option fails fast with 400
 *  instead of travelling into the pipeline, the same fail-fast rule as
 *  the CLI's manual-SIREN boundary (same checksum validation there,
 *  same behavior here). */
class OptionsValidationError extends Error {}

/** A crawl option must be a positive whole number when present. Zero or
 *  a negative value is not "no limit": the crawler applies a stored
 *  option as-is (only an absent one falls back to config), so zero pages
 *  empties the audit, zero depth strands the crawl, zero delay strips
 *  the politeness pacing of CLAUDE.md rule 5, and zero scan lanes cannot
 *  run at all. A fraction cannot be a page count at all. */
function requirePositiveIntOptions(
  record: Record<string, unknown>,
  keys: readonly ('maxPages' | 'maxDepth' | 'delayMs' | 'scanConcurrency')[],
): void {
  for (const key of keys) {
    const raw = record[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
      throw new OptionsValidationError(`${key} must be a positive whole number`);
    }
  }
}

function parseOptionsSnapshot(raw: unknown): JobOptionsSnapshot {
  const options: JobOptionsSnapshot = {};
  if (raw === undefined || raw === null || typeof raw !== 'object') return options;
  const record = raw as Record<string, unknown>;
  requirePositiveIntOptions(record, ['maxPages', 'maxDepth', 'delayMs', 'scanConcurrency']);
  if (typeof record['maxPages'] === 'number') options.maxPages = record['maxPages'];
  if (typeof record['maxDepth'] === 'number') options.maxDepth = record['maxDepth'];
  if (typeof record['delayMs'] === 'number') options.delayMs = record['delayMs'];
  if (typeof record['scanConcurrency'] === 'number') {
    options.scanConcurrency = record['scanConcurrency'];
  }

  const rawSiren = record['siren'];
  if (typeof rawSiren === 'string' && rawSiren.trim() !== '') {
    const cleaned = rawSiren.replace(/\s/g, '');
    if (!isValidSiren(cleaned)) {
      throw new OptionsValidationError(
        'siren must be a valid SIREN (9 digits, passing the INSEE checksum)',
      );
    }
    options.siren = cleaned;
  }

  if (typeof record['transactionalFlow'] === 'boolean') {
    options.transactionalFlow = record['transactionalFlow'];
  }
  if (
    typeof record['transactionalFlowReason'] === 'string' &&
    record['transactionalFlowReason'].trim() !== ''
  ) {
    options.transactionalFlowReason = record['transactionalFlowReason'].trim();
  }

  if (typeof record['prospectId'] === 'string' && record['prospectId'].trim() !== '') {
    options.prospectId = record['prospectId'].trim();
  }

  const rawSeeds = record['seeds'];
  if (Array.isArray(rawSeeds) && rawSeeds.length > 0) {
    if (!rawSeeds.every(isHttpUrlWithoutCredentials)) {
      throw new OptionsValidationError('seeds must be an array of valid URLs');
    }
    options.seeds = rawSeeds;
  }

  const rawExclusions = record['exclusions'];
  if (Array.isArray(rawExclusions) && rawExclusions.length > 0) {
    if (!rawExclusions.every(isPlausibleGlob)) {
      throw new OptionsValidationError('exclusions must be an array of non-empty glob patterns');
    }
    options.exclusions = rawExclusions;
  }

  const rawBookingEngineUrl = record['bookingEngineUrl'];
  if (typeof rawBookingEngineUrl === 'string' && rawBookingEngineUrl.trim() !== '') {
    if (!isHttpUrlWithoutCredentials(rawBookingEngineUrl)) {
      throw new OptionsValidationError('bookingEngineUrl must be a valid URL');
    }
    options.bookingEngineUrl = rawBookingEngineUrl;
  }

  return options;
}

function mergeTopLevelProspectId(
  options: JobOptionsSnapshot,
  body: Record<string, unknown>,
): JobOptionsSnapshot {
  if (options.prospectId !== undefined) return options;
  const prospectId = body['prospectId'];
  return typeof prospectId === 'string' && prospectId.trim() !== ''
    ? { ...options, prospectId: prospectId.trim() }
    : options;
}

async function autoAttachProspect(
  connection: Connection,
  options: JobOptionsSnapshot,
  registrableDomain: string,
): Promise<JobOptionsSnapshot> {
  if (options.prospectId !== undefined) return options;
  const matches = (await findProspectsByDomain(connection, registrableDomain)).filter(
    (prospect) => prospect.archivedAt === undefined,
  );
  return matches.length === 1 ? { ...options, prospectId: matches[0]!.prospectId } : options;
}

type LaunchableScanType = 'quick-check' | 'full-audit';

type ScanLaunchOutcome =
  | { started: true; job: JobDocument }
  | {
      started: false;
      refusal: 'invalid-url' | 'suppressed' | 'host-busy' | 'prospect-unavailable';
    };

/** The one launch path behind both the single and the batch endpoint: attach
 *  a prospect, run the launch guard, then create the ordinary job. Throws
 *  OptionsValidationError for options this route must refuse. A lost launch
 *  race for the same prospect slot answers host-busy, the same way the
 *  read-side conflict check does, instead of surfacing as a server error. */
async function launchScan(
  connection: Connection,
  type: LaunchableScanType,
  url: string,
  requested: JobOptionsSnapshot,
): Promise<ScanLaunchOutcome> {
  const domain = registrableDomainForScan(url);
  if (domain === null) return { started: false, refusal: 'invalid-url' };
  const options = await autoAttachProspect(connection, requested, domain);
  if (options.prospectId !== undefined) {
    // Archive retention purges any audit linked to an archived prospect
    // (issue #381), so a scan must never link to one, nor to a prospect
    // that does not exist.
    const prospect = await getProspectHub(connection, options.prospectId);
    if (prospect === null || prospect.archivedAt !== undefined) {
      return { started: false, refusal: 'prospect-unavailable' };
    }
  }
  const check = await checkScanLaunch(connection, {
    url,
    kind: type,
    ...(options.prospectId === undefined ? {} : { prospectId: options.prospectId }),
  });
  if (!check.allowed) return { started: false, refusal: check.refusal };
  try {
    const job = await createJob(connection, {
      type: canonicalJobTypeForScanIntent(type),
      siteUrl: url,
      // Quick Check scans exactly one page whatever the options say.
      options: type === 'quick-check' ? { ...options, maxPages: 1 } : options,
    });
    return { started: true, job };
  } catch (error) {
    if (!(error instanceof ActiveJobSlotTakenError)) throw error;
    return { started: false, refusal: 'host-busy' };
  }
}

/** Upper bound on one batch: an overnight run is 5 to 10 sites, and a bound
 *  keeps a malformed client from queueing the whole directory by accident. */
export const MAX_SCAN_BATCH_SIZE = 50;

/** Options that describe one site rather than a crawl policy. A batch shares
 *  one options block across every site, so these are refused there instead of
 *  being silently applied to the wrong businesses. */
const PER_SITE_OPTION_KEYS = [
  'prospectId',
  'siren',
  'seeds',
  'bookingEngineUrl',
  'transactionalFlow',
  'transactionalFlowReason',
] as const;

type BatchItemResult =
  | { index: number; url: string; prospectId?: string; outcome: 'queued'; jobId: string }
  | {
      index: number;
      url: string;
      prospectId?: string;
      outcome: 'skipped';
      reason: 'already-active';
    }
  | {
      index: number;
      url: string;
      prospectId?: string;
      outcome: 'rejected';
      reason: 'invalid-url' | 'suppressed' | 'prospect-unavailable';
    };

/** Registers the job-creation and job-status endpoints. `queue.notify()`
 *  is called after every successful create so a submitted scan starts
 *  promptly rather than waiting out the queue's poll interval. */
export function registerScanRoutes(router: Router, connection: Connection, queue: JobQueue): void {
  router.post('/api/scans', async ({ req, res }) => {
    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;

    if (body === undefined || body === null || typeof body !== 'object') {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    const parsed = body as Record<string, unknown>;

    // Plan 050: a complete crawl is launched only as a Full scan. The
    // retired intent gets an explicit refusal instead of the generic
    // unknown-type error so an old client learns what replaced it.
    if (parsed['type'] === 'prospecting-audit' || parsed['type'] === 'outreach-full-scan') {
      sendError(
        res,
        400,
        `"${parsed['type']}" is no longer a launchable scan; use "full-audit" for a complete scan`,
      );
      return;
    }

    if (parsed['type'] === 'quick-check' || parsed['type'] === 'full-audit') {
      const type: LaunchableScanType = parsed['type'];
      const url = parsed['url'];
      if (!isHttpUrlWithoutCredentials(url) || registrableDomainForScan(url) === null) {
        sendError(res, 400, 'url must be an absolute http(s) URL without embedded credentials');
        return;
      }
      let requested: JobOptionsSnapshot;
      try {
        requested = mergeTopLevelProspectId(parseOptionsSnapshot(parsed['options']), parsed);
      } catch (error) {
        sendError(res, 400, error instanceof Error ? error.message : 'invalid options');
        return;
      }
      const outcome = await launchScan(connection, type, url, requested);
      if (!outcome.started) {
        sendJson(res, 200, { started: false, refusal: outcome.refusal });
        return;
      }
      logJobCreated(req, outcome.job.jobId, outcome.job.type);
      queue.notify();
      sendJson(res, 201, { started: true, jobId: outcome.job.jobId, type });
      return;
    }

    if (parsed['type'] === 'prospecting') {
      const urls = parsed['urls'];
      if (!Array.isArray(urls) || urls.length === 0 || !urls.every(isHttpUrlWithoutCredentials)) {
        sendError(res, 400, 'urls must be a non-empty array of valid URLs');
        return;
      }
      const job = await createJob(connection, { type: 'prospecting', urls, options: {} });
      logJobCreated(req, job.jobId, job.type);
      queue.notify();
      sendJson(res, 201, { jobId: job.jobId });
      return;
    }

    sendError(res, 400, 'type must be "quick-check", "full-audit", or "prospecting"');
  });

  /** Queues several sites in one submission (issue #375). A batch is only a
   *  submission convenience: each accepted site becomes an ordinary job,
   *  created in the order given, which the FIFO claim then processes in the
   *  same order. Everything a whole batch can get wrong (type, shape, size,
   *  shared options) is refused with 400 before any job exists. Per-site
   *  problems never fail the batch: an invalid or suppressed site is
   *  rejected, a site that already has an active scan is skipped, and the
   *  response names the outcome of every site. Jobs are created one by one,
   *  so an interrupted request can leave the first sites queued; submitting
   *  the same batch again is safe because those sites are then skipped. */
  router.post('/api/scans/batch', async ({ req, res }) => {
    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    if (body === undefined || body === null || typeof body !== 'object') {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    const parsed = body as Record<string, unknown>;
    const type = parsed['type'];
    if (type !== 'quick-check' && type !== 'full-audit') {
      sendError(res, 400, 'type must be "quick-check" or "full-audit"');
      return;
    }
    const items = parsed['items'];
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_SCAN_BATCH_SIZE) {
      sendError(res, 400, `items must be an array of 1 to ${MAX_SCAN_BATCH_SIZE} sites`);
      return;
    }
    const sites: { url: unknown; prospectId?: string }[] = [];
    for (const item of items) {
      if (item === null || typeof item !== 'object') {
        sendError(res, 400, 'each item must be an object with a url');
        return;
      }
      const record = item as Record<string, unknown>;
      const prospectId = record['prospectId'];
      if (
        prospectId !== undefined &&
        (typeof prospectId !== 'string' || prospectId.trim() === '')
      ) {
        sendError(res, 400, 'item prospectId must be a non-empty string when present');
        return;
      }
      sites.push({
        url: record['url'],
        ...(typeof prospectId === 'string' ? { prospectId: prospectId.trim() } : {}),
      });
    }
    const rawOptions = parsed['options'];
    if (rawOptions !== undefined && rawOptions !== null && typeof rawOptions === 'object') {
      const perSite = PER_SITE_OPTION_KEYS.filter((key) => key in rawOptions);
      if (perSite.length > 0) {
        sendError(res, 400, `batch options cannot carry per-site fields: ${perSite.join(', ')}`);
        return;
      }
    }
    let shared: JobOptionsSnapshot;
    try {
      shared = parseOptionsSnapshot(rawOptions);
    } catch (error) {
      sendError(res, 400, error instanceof Error ? error.message : 'invalid options');
      return;
    }

    const results: BatchItemResult[] = [];
    for (const [index, site] of sites.entries()) {
      const identity = {
        index,
        url: typeof site.url === 'string' ? site.url : '',
        ...(site.prospectId === undefined ? {} : { prospectId: site.prospectId }),
      };
      if (!isHttpUrlWithoutCredentials(site.url)) {
        results.push({ ...identity, outcome: 'rejected', reason: 'invalid-url' });
        continue;
      }
      const requested =
        site.prospectId === undefined ? shared : { ...shared, prospectId: site.prospectId };
      const outcome = await launchScan(connection, type, site.url, requested);
      if (outcome.started) {
        logJobCreated(req, outcome.job.jobId, outcome.job.type);
        results.push({ ...identity, outcome: 'queued', jobId: outcome.job.jobId });
      } else if (outcome.refusal === 'host-busy') {
        results.push({ ...identity, outcome: 'skipped', reason: 'already-active' });
      } else {
        results.push({ ...identity, outcome: 'rejected', reason: outcome.refusal });
      }
    }
    const count = (outcome: BatchItemResult['outcome']): number =>
      results.filter((result) => result.outcome === outcome).length;
    if (count('queued') > 0) queue.notify();
    sendJson(res, 200, {
      type,
      queued: count('queued'),
      skipped: count('skipped'),
      rejected: count('rejected'),
      results,
    });
  });

  router.get('/api/scans', async ({ res, query }) => {
    const limitParam = query.get('limit');
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
    const jobs = (
      await listJobs(
        connection,
        Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
      )
    ).filter(
      (job) =>
        job.type !== 'prospecting' ||
        job.scanType === 'quick-check' ||
        job.scanType === 'prospecting-audit',
    );

    const auditIds = jobs.map((job) => job.auditId).filter((id): id is string => id !== undefined);
    const rollups = await getSeverityRollupsForPoll(connection, auditIds);
    // Only the scan queue names its jobs, so only waiting and running jobs
    // pay for the prospect lookup.
    const prospectNames = await getProspectNames(
      connection,
      jobs
        .filter((job) => job.status === 'queued' || job.status === 'running')
        .map((job) => job.prospectId)
        .filter((id): id is string => id !== undefined),
    );

    const summaries = jobs.map((job) => ({
      prospectId: job.prospectId,
      prospectName: job.prospectId === undefined ? undefined : prospectNames.get(job.prospectId),
      jobId: job.jobId,
      type: displayJobIntent(job.type, job.scanType),
      status: job.status,
      phase: job.phase,
      siteUrl: job.siteUrl,
      urls: job.urls,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      auditId: job.auditId,
      auditIds: job.auditIds,
      severityRollup: job.auditId ? rollups.get(job.auditId) : undefined,
      needsReview: job.needsReview,
      awaitsInput: job.awaitsInput,
    }));

    sendJson(res, 200, summaries);
  });

  router.get('/api/scans/:jobId', async ({ res, params }) => {
    const job = await getJob(connection, params['jobId']!);
    if (!job) {
      sendError(res, 404, 'job not found');
      return;
    }
    const prospect =
      job.options.prospectId === undefined
        ? null
        : await getProspectHub(connection, job.options.prospectId);
    sendJson(res, 200, {
      ...job,
      type: displayJobIntent(job.type, job.options.scanType),
      prospectId: job.options.prospectId,
      prospectName: prospect?.name,
    });
  });

  /** Operator clear of every queued job at once. Running and terminal
   *  jobs are untouched; a stop for a running job goes through the
   *  per-job cancel route below. */
  router.post('/api/scans/queue/clear', async ({ res }) => {
    const cleared = await cancelQueuedJobs(connection, 'cancelled by operator');
    sendJson(res, 200, { cleared });
  });

  /** Operator stop for one job. The document is terminal from this moment
   *  (so the dashboard and the claim filter both react at once). The stop
   *  is registered for any non-terminal read, queued or running, so a
   *  queued-to-running claim transition between the read and the
   *  registration still aborts the in-flight pipeline work at its next
   *  safe boundary via the queue's cancellation registry. */
  router.post('/api/scans/:jobId/cancel', async ({ res, params }) => {
    const jobId = params['jobId']!;
    const job = await getJob(connection, jobId);
    if (!job) {
      sendError(res, 404, 'job not found');
      return;
    }
    if (job.status !== 'queued' && job.status !== 'running') {
      sendError(res, 409, `job is already ${job.status}`);
      return;
    }
    if (
      job.status === 'running' &&
      job.type !== 'full-audit' &&
      job.type !== 'quick-check' &&
      job.type !== 'prospecting-audit' &&
      job.type !== 'prospecting' &&
      job.type !== 'outreach-full-scan'
    ) {
      sendError(
        res,
        409,
        `running ${job.type} jobs cannot be stopped and will finish on their own`,
      );
      return;
    }
    queue.requestCancel(jobId);
    const cancelled = await cancelJob(connection, jobId, 'cancelled by operator');
    if (!cancelled) {
      sendError(res, 409, 'job is no longer queued or running');
      return;
    }
    sendJson(res, 200, { jobId, status: 'cancelled' });
  });

  /** Deletes one job row and, when the job produced audits, every audit it
   *  produced: documents across all five audit-linked collections plus the
   *  artifacts directory and its bucket copy (issue #384). Storage goes
   *  first and a storage failure answers 503 with the audit rows kept, so
   *  the operator can retry instead of being told the space was reclaimed. Running jobs are refused (stop first), so a
   *  deleted job can never keep consuming the server invisibly. */
  router.delete('/api/scans/:jobId', async ({ res, params }) => {
    const jobId = params['jobId']!;
    const job = await getJob(connection, jobId);
    if (!job) {
      sendError(res, 404, 'job not found');
      return;
    }
    if (job.status === 'running') {
      sendError(res, 409, 'a running job must be stopped before it can be deleted');
      return;
    }
    // A stopped job is marked cancelled at once, but its pipeline only
    // aborts at the next stage boundary. Deleting before then would let the
    // remaining stages write an audit, analyses and reports nothing links to.
    if (queue.isJobInFlight(jobId)) {
      sendError(
        res,
        409,
        'the stopped job is still finishing its current stage; try again shortly',
      );
      return;
    }

    // A queued job has produced no audits. Deleting it only while it is
    // still unclaimed closes the race where the worker claims it between the
    // read above and the delete, which would leave a running pipeline with
    // no job row to report into.
    if (job.status === 'queued') {
      const deleted = await deleteJob(connection, jobId, { onlyIfStatusNot: ['running'] });
      if (!deleted) {
        sendError(res, 409, 'the job has just started; stop it before deleting it');
        return;
      }
      sendJson(res, 200, { jobId, deleted: true, auditsDeleted: 0 });
      return;
    }

    const auditIds = new Set<string>();
    if (job.auditId !== undefined) auditIds.add(job.auditId);
    for (const id of job.auditIds ?? []) auditIds.add(id);
    for (const row of job.urlResults ?? []) {
      if (row.auditId !== undefined) auditIds.add(row.auditId);
    }

    const artifactStore = createConfiguredArtifactStore();
    for (const auditId of auditIds) {
      const audit = await getAudit(connection, auditId);
      if (audit !== null) {
        try {
          await deleteAuditArtifacts(audit, {
            artifactsRoot: getArtifactsRoot(),
            store: artifactStore,
          });
        } catch (error) {
          if (!(error instanceof AuditArtifactDeletionError)) throw error;
          sendError(res, 503, `${error.message}; nothing else was deleted for it, retry`);
          return;
        }
      }
      await deleteAuditCascade(connection, auditId);
    }

    const deleted = await deleteJob(connection, jobId, { onlyIfStatusNot: ['queued', 'running'] });
    sendJson(res, 200, { jobId, deleted, auditsDeleted: auditIds.size });
  });
}
