import type { Connection } from 'mongoose';
import {
  isCrawlCoverageGateMessage,
  isHttpUrlWithoutCredentials,
  isOutsideEuTerritory,
  isValidSiren,
} from '@odysseus/core';
import {
  ActiveJobSlotTakenError,
  cancelQueuedJobs,
  requestJobCancellation,
  createJob,
  deleteAuditCascade,
  deleteJob,
  checkScanLaunch,
  findProspectsByDomain,
  getAudit,
  getLatestFullAuditEstimateSource,
  getProspectHub,
  getAuditProspectLinks,
  getProspectLabels,
  findAuditsWithUnreadyReports,
  getJob,
  listJobs,
  readScanQueue,
  reorderScanQueue,
  canonicalJobTypeForScanIntent,
  displayJobIntent,
  type JobDocument,
  type JobType,
  type JobOptionsSnapshot,
  registrableDomainForScan,
} from '@odysseus/store';
import { getArtifactsRoot, getCrawlDelayMs } from '@odysseus/scanner';
import type { Router } from '../router.js';
import {
  AuditArtifactDeletionError,
  deleteAuditArtifacts,
  jobRunArtifactLocation,
  type AuditArtifactLocation,
} from '../artifacts/delete-audit-artifacts.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import {
  jsonBodyNotRead,
  readJsonBodyOrRespond,
  sendError,
  sendJson,
  sendProblem,
} from '../http-utils.js';
import type { ActionCapability } from '../operator/contract.js';
import {
  cancelJobCapability,
  deleteJobCapability,
  jobCapabilities,
  type JobCapabilityInputs,
} from '../operator/job-capabilities.js';
import { projectLegacyJob } from '../operator/legacy-job-projection.js';
import type { JobQueue } from '../queue/job-queue.js';
import { isReportProductionInFlight } from '../pipeline/report-production-lock.js';
import { reportProductionState } from '../pipeline/report-production-state.js';
import { scanOutcomeCode, reportFailureStageOf } from './scan-outcome.js';
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

/** Job kinds that represent a scan and therefore belong in the dashboard's
 *  scan history. Outreach draft/follow-up batch jobs share the durable queue
 *  but have no scan detail page and must never be projected as one. */
const DASHBOARD_SCAN_JOB_TYPES: readonly JobType[] = [
  'full-audit',
  'quick-check',
  'prospecting-audit',
  'prospecting',
  'outreach-full-scan',
];

type ScanLaunchOutcome =
  | { started: true; job: JobDocument }
  | {
      started: false;
      refusal:
        | 'invalid-url'
        | 'suppressed'
        | 'host-busy'
        | 'prospect-unavailable'
        | 'prospect-domain-mismatch'
        | 'outside-eu';
      /** With 'host-busy', when known: the job holding the slot. */
      conflictingJobId?: string;
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
    const prospectDomains = (prospect.websites ?? [])
      .map((website) => registrableDomainForScan(website.url) ?? website.registrableDomain)
      .filter((websiteDomain): websiteDomain is string => websiteDomain !== '');
    if (prospectDomains.length > 0 && !prospectDomains.includes(domain)) {
      return { started: false, refusal: 'prospect-domain-mismatch' };
    }
    if (isOutsideEuTerritory({ postcode: prospect.postcode, url })) {
      return { started: false, refusal: 'outside-eu' };
    }
  } else if (isOutsideEuTerritory({ url })) {
    // Odysseus audits France and the EU only (core's eu-territory.ts).
    return { started: false, refusal: 'outside-eu' };
  }
  const check = await checkScanLaunch(connection, {
    url,
    kind: type,
    ...(options.prospectId === undefined ? {} : { prospectId: options.prospectId }),
  });
  if (!check.allowed) {
    return {
      started: false,
      refusal: check.refusal,
      ...(check.conflictingJobId === undefined ? {} : { conflictingJobId: check.conflictingJobId }),
    };
  }
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
    return { started: false, refusal: 'host-busy', conflictingJobId: error.conflictingJobId };
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
      reason:
        | 'invalid-url'
        | 'suppressed'
        | 'prospect-unavailable'
        | 'prospect-domain-mismatch'
        | 'outside-eu';
    };

/** The non-default options a waiting scan carries, as closed flags for the
 *  queue row; the full options stay on the job detail read. */
function queuedOptionsSummary(options: JobOptionsSnapshot): string[] {
  const flags: string[] = [];
  if (options.maxPages !== undefined && options.maxPages > 1) flags.push('page-limit');
  if (options.maxDepth !== undefined) flags.push('depth-limit');
  if (options.delayMs !== undefined) flags.push('custom-delay');
  if (options.scanConcurrency !== undefined) flags.push('custom-concurrency');
  if ((options.seeds?.length ?? 0) > 0) flags.push('extra-seeds');
  if ((options.exclusions?.length ?? 0) > 0) flags.push('exclusions');
  if (options.siren !== undefined) flags.push('manual-siren');
  if (options.bookingEngineUrl !== undefined) flags.push('booking-engine');
  if (options.transactionalFlow !== undefined) flags.push('transactional-flow');
  return flags;
}

function capabilityInputs(job: JobCapabilityInputs['job'], queue: JobQueue): JobCapabilityInputs {
  const auditIds = [...(job.auditId === undefined ? [] : [job.auditId]), ...(job.auditIds ?? [])];
  return {
    job,
    inFlight: queue.isJobInFlight(job.jobId),
    reportProductionInFlight: auditIds.some((auditId) => isReportProductionInFlight(auditId)),
  };
}

/** Plan 061 §8.2 steps 4-5: the capability recomputed from freshly loaded
 *  state must still be available and still carry the token the client saw.
 *  Answers the typed problem and returns false otherwise. */
function recheckCapability(
  res: Parameters<typeof sendProblem>[0],
  capability: ActionCapability,
  presentedToken: unknown,
): boolean {
  if (typeof presentedToken !== 'string' || presentedToken === '') {
    sendProblem(res, 400, {
      code: 'invalid-request',
      message: 'stateToken is required; reload the current state first',
    });
    return false;
  }
  if (capability.stateToken !== presentedToken) {
    sendProblem(res, 409, {
      code: 'state-changed',
      message: 'the job changed since this page loaded; refresh and try again',
      retryable: true,
    });
    return false;
  }
  if (capability.state === 'blocked') {
    sendProblem(res, 409, {
      code: 'action-blocked',
      message: `action blocked: ${capability.reasonCode}`,
      reasonCode: capability.reasonCode,
      ...(capability.blockingRef === undefined ? {} : { blockingRef: capability.blockingRef }),
    });
    return false;
  }
  return true;
}

/** Registers the job-creation and job-status endpoints. `queue.notify()`
 *  is called after every successful create so a submitted scan starts
 *  promptly rather than waiting out the queue's poll interval. */
export function registerScanRoutes(router: Router, connection: Connection, queue: JobQueue): void {
  router.get('/api/scans/estimate', async ({ res, query }) => {
    const rawUrl = query.get('url');
    if (!isHttpUrlWithoutCredentials(rawUrl) || registrableDomainForScan(rawUrl) === null) {
      sendError(res, 400, 'url must be an absolute http(s) URL without embedded credentials');
      return;
    }
    const source = await getLatestFullAuditEstimateSource(connection, new URL(rawUrl).hostname);
    if (source === undefined) {
      sendJson(res, 200, { available: false });
      return;
    }
    const requestedDelayMs = Number(query.get('delayMs'));
    const delayMs =
      Number.isFinite(requestedDelayMs) && requestedDelayMs > 0
        ? Math.max(requestedDelayMs, getCrawlDelayMs())
        : getCrawlDelayMs();
    // Older full audits predate persisted surface-selection coverage. Keep
    // the estimate available with a rough two-in-five sample assumption.
    const sampledSurfaceShare =
      source.sampledSurfacePageCount > 0 ? source.sampledSurfacePageCount / source.pageCount : 0.4;
    const lighthouseShare =
      source.lighthousePageCount > 0 ? source.lighthousePageCount / source.pageCount : 0.4;
    const plannedSlotsPerPage = 3 + 2 * sampledSurfaceShare + lighthouseShare;
    sendJson(res, 200, {
      available: true,
      pageCount: source.pageCount,
      estimatedMs: Math.round(source.pageCount * plannedSlotsPerPage * delayMs),
    });
  });

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
    if (parsed['type'] === 'prospecting') {
      sendError(res, 400, '"prospecting" is retired; use /api/scans/batch with type "quick-check"');
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
        sendJson(res, 200, {
          started: false,
          refusal: outcome.refusal,
          ...(outcome.conflictingJobId === undefined
            ? {}
            : { conflictingJobId: outcome.conflictingJobId }),
        });
        return;
      }
      logJobCreated(req, outcome.job.jobId, outcome.job.type);
      queue.notify();
      sendJson(res, 201, { started: true, jobId: outcome.job.jobId, type });
      return;
    }

    sendError(res, 400, 'type must be "quick-check" or "full-audit"');
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
        { types: DASHBOARD_SCAN_JOB_TYPES },
      )
    ).filter(
      (job) =>
        DASHBOARD_SCAN_JOB_TYPES.includes(job.type) &&
        (job.type !== 'prospecting' ||
          job.scanType === 'quick-check' ||
          job.scanType === 'prospecting-audit'),
    );

    const auditIds = jobs.map((job) => job.auditId).filter((id): id is string => id !== undefined);
    const rollups = await getSeverityRollupsForPoll(connection, auditIds);
    // A scan launched without a prospect and attached afterwards carries the
    // link on its audit only, and a detached audit drops it there, so a row
    // with a stored audit follows the audit's link; the job's own prospect
    // covers scans that have no audit yet.
    const auditLinks = await getAuditProspectLinks(connection, auditIds);
    const rowProspectId = (job: (typeof jobs)[number]): string | undefined =>
      job.auditId !== undefined && auditLinks.has(job.auditId)
        ? auditLinks.get(job.auditId)
        : job.prospectId;
    // The scan queue and the Audits table both name the linked hotel, and
    // the table shows its sales status, so every prospect-linked row pays
    // for the (single, batched) lookup.
    const prospectLabels = await getProspectLabels(
      connection,
      jobs.map(rowProspectId).filter((id): id is string => id !== undefined),
    );

    // Issue #389: a completed Full scan whose reports were later lost to a
    // failed regeneration, or never became current, is a report issue. Only
    // Full scans produce client reports; a run in flight is not judged.
    const reportedAuditIds = jobs
      .filter((job) => job.type === 'full-audit' && job.status === 'complete')
      .map((job) => job.auditId)
      .filter((id): id is string => id !== undefined && !isReportProductionInFlight(id));
    const unreadyReports = await findAuditsWithUnreadyReports(connection, reportedAuditIds);

    const summaries = jobs.map((job) => {
      // The per-row verdict of the unready-reports query above (issue #389).
      const reportNotReady =
        job.auditId !== undefined &&
        reportedAuditIds.includes(job.auditId) &&
        (unreadyReports.has(job.auditId) || reportProductionState(job.auditId).status === 'failed');
      const prospectId = rowProspectId(job);
      const prospect = prospectId === undefined ? undefined : prospectLabels.get(prospectId);
      return {
        prospectId,
        prospectName: prospect?.name,
        prospectStatus: prospect?.status,
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
        failedPhase: job.failedPhase,
        awaitsInput: job.awaitsInput,
        waitingForServer: job.waitingForServer,
        reportNotReady: reportNotReady ? true : undefined,
        // Plan 060 §5.3: the display classification travels with the row as
        // a closed code, so the browser never re-derives it from raw fields.
        outcomeCode: scanOutcomeCode({
          type: job.type,
          status: job.status,
          ...(job.auditId === undefined ? {} : { auditId: job.auditId }),
          ...(job.failedPhase === undefined ? {} : { failedPhase: job.failedPhase }),
          ...(job.awaitsInput === undefined ? {} : { awaitsInput: job.awaitsInput }),
          ...(reportNotReady ? { reportNotReady: true } : {}),
        }),
        capabilities: jobCapabilities(capabilityInputs(job, queue)),
      };
    });

    sendJson(res, 200, summaries);
  });

  /** Plan 061 §6.2 and §11: the waiting scans in durable claim order, with
   *  the revision a reorder must name. Registered before the :jobId read so
   *  the literal segment wins. */
  router.get('/api/scans/queue', async ({ res }) => {
    const snapshot = await readScanQueue(connection);
    const prospectLabels = await getProspectLabels(
      connection,
      snapshot.jobs
        .map((job) => job.options.prospectId)
        .filter((id): id is string => id !== undefined),
    );
    sendJson(res, 200, {
      queueRevision: snapshot.queueRevision,
      truncated: snapshot.truncated,
      jobs: snapshot.jobs.map((job, index) => ({
        jobId: job.jobId,
        type: displayJobIntent(job.type, job.options.scanType),
        siteUrl: job.siteUrl,
        prospectId: job.options.prospectId,
        prospectName:
          job.options.prospectId === undefined
            ? undefined
            : prospectLabels.get(job.options.prospectId)?.name,
        createdAt: job.createdAt,
        position: index + 1,
        options: queuedOptionsSummary(job.options),
        cancel: cancelJobCapability(
          capabilityInputs({ jobId: job.jobId, type: job.type, status: 'queued' }, queue),
        ),
      })),
    });
  });

  /** Plan 061 §6.2: applies an operator reorder of the waiting scans. The
   *  body names the queue revision it was computed from and the complete new
   *  order; a stale revision answers the typed state-changed problem with
   *  the current order so the client can refresh without a second read. */
  router.post('/api/scans/queue/reorder', async ({ req, res }) => {
    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    const record = (body ?? {}) as Record<string, unknown>;
    const queueRevision = record['queueRevision'];
    const orderedJobIds = record['orderedJobIds'];
    if (
      typeof queueRevision !== 'string' ||
      !Array.isArray(orderedJobIds) ||
      !orderedJobIds.every((id): id is string => typeof id === 'string')
    ) {
      sendProblem(res, 400, {
        code: 'invalid-request',
        message: 'queueRevision (string) and orderedJobIds (string[]) are required',
      });
      return;
    }
    const result = await reorderScanQueue(connection, {
      expectedRevision: queueRevision,
      orderedJobIds,
    });
    if (result.outcome === 'state-changed') {
      sendProblem(res, 409, {
        code: 'state-changed',
        message: 'the queue changed since this page loaded; refresh and try again',
        retryable: true,
      });
      return;
    }
    if (result.outcome === 'invalid-order') {
      sendProblem(res, 400, {
        code: 'invalid-request',
        message: 'orderedJobIds must list every waiting scan exactly once',
      });
      return;
    }
    sendJson(res, 200, {
      queueRevision: result.snapshot.queueRevision,
      orderedJobIds: result.snapshot.jobs.map((job) => job.jobId),
    });
  });

  router.get('/api/scans/:jobId', async ({ res, params }) => {
    const job = await getJob(connection, params['jobId']!);
    if (!job) {
      sendError(res, 404, 'job not found');
      return;
    }
    // Same rule as the list: a stored audit owns the prospect link, so a
    // scan attached after it ran opens and relaunches for that prospect.
    const auditLinks =
      job.auditId === undefined
        ? new Map<string, string | undefined>()
        : await getAuditProspectLinks(connection, [job.auditId]);
    const prospectId =
      job.auditId !== undefined && auditLinks.has(job.auditId)
        ? auditLinks.get(job.auditId)
        : job.options.prospectId;
    const prospect = prospectId === undefined ? null : await getProspectHub(connection, prospectId);
    sendJson(res, 200, {
      ...job,
      type: displayJobIntent(job.type, job.options.scanType),
      // Plan 060 §5.3: same server-computed display codes the list rows
      // carry. The document itself has no unready-report read, so a
      // complete row keeps its run-state code here; report readiness on a
      // finished audit is the audit page's contract.
      outcomeCode: scanOutcomeCode({
        type: job.type,
        status: job.status,
        ...(job.auditId === undefined ? {} : { auditId: job.auditId }),
        ...(job.failedPhase === undefined ? {} : { failedPhase: job.failedPhase }),
        awaitsInput: (job.needsInputFields?.length ?? 0) > 0,
      }),
      // Non-null exactly when outcomeCode is 'report-issue'; the failure
      // card uses it to name the failed report step.
      reportFailureStage: reportFailureStageOf(job),
      // The coverage gate's remedy link, declared structurally instead of
      // the browser matching the stored failure sentence (plan 060 §5.3).
      coverageGateBlocked: isCrawlCoverageGateMessage(job.error),
      prospectId,
      prospectName: prospect?.name,
      work: projectLegacyJob(job),
      capabilities: jobCapabilities(capabilityInputs(job, queue)),
    });
  });

  /** Operator clear of every queued job at once. Running and terminal
   *  jobs are untouched; a stop for a running job goes through the
   *  per-job cancel route below. */
  router.post('/api/scans/queue/clear', async ({ res }) => {
    const cleared = await cancelQueuedJobs(connection, 'cancelled by operator');
    sendJson(res, 200, { cleared });
  });

  /** Operator stop for one job (plan 061 §7). The body carries the cancel
   *  capability's stateToken; a queued-to-running transition since the page
   *  loaded changes the token, because removing a waiting scan and stopping
   *  a running one preserve different work. A queued job is cancelled at
   *  once; a running one becomes cancel-requested until its worker lets go
   *  at the next safe boundary. */
  router.post('/api/scans/:jobId/cancel', async ({ req, res, params }) => {
    const body = await readJsonBodyOrRespond(req, res);
    if (body === jsonBodyNotRead) return;
    const jobId = params['jobId']!;
    const job = await getJob(connection, jobId);
    if (!job) {
      sendProblem(res, 404, { code: 'not-found', message: 'job not found' });
      return;
    }
    const presented = (body as Record<string, unknown> | undefined)?.['stateToken'];
    if (!recheckCapability(res, cancelJobCapability(capabilityInputs(job, queue)), presented)) {
      return;
    }
    const cancellation = await requestJobCancellation(connection, jobId, 'cancelled by operator');
    if (cancellation === 'not-cancellable') {
      sendProblem(res, 409, {
        code: 'state-changed',
        message: 'job is no longer queued or running',
        retryable: true,
      });
      return;
    }
    if (cancellation === 'cancel-requested') queue.requestCancel(jobId);
    sendJson(res, 200, { jobId, status: cancellation });
  });

  /** Deletes one job row and, when the job produced audits, every audit it
   *  produced: documents across all five audit-linked collections plus the
   *  artifacts directory and its bucket copy (issue #384). Storage goes
   *  first and a storage failure answers 503 with the audit rows kept, so
   *  the operator can retry instead of being told the space was reclaimed. Running jobs are refused (stop first), so a
   *  deleted job can never keep consuming the server invisibly. */
  router.delete('/api/scans/:jobId', async ({ res, params, query }) => {
    const jobId = params['jobId']!;
    const job = await getJob(connection, jobId);
    if (!job) {
      sendProblem(res, 404, { code: 'not-found', message: 'job not found' });
      return;
    }
    // Running, cancel-requested and still-finishing work (a stopped job's
    // pipeline only lets go at its next stage boundary) are all blocked by
    // the capability, so remaining stages can never write an audit, analyses
    // or reports that nothing links to.
    const capability = deleteJobCapability(capabilityInputs(job, queue));
    if (!recheckCapability(res, capability, query.get('stateToken'))) return;

    const artifactStore = createConfiguredArtifactStore();
    // Storage before records: a failure answers 503 with the rows kept, so
    // the operator can retry instead of being told the space was reclaimed.
    const removeArtifacts = async (location: AuditArtifactLocation): Promise<boolean> => {
      try {
        await deleteAuditArtifacts(location, {
          artifactsRoot: getArtifactsRoot(),
          store: artifactStore,
        });
        return true;
      } catch (error) {
        if (!(error instanceof AuditArtifactDeletionError)) throw error;
        sendProblem(res, 503, {
          code: 'storage-unavailable',
          message: `${error.message}; nothing else was deleted for it, retry`,
          retryable: true,
        });
        return false;
      }
    };
    // The job's own run directory goes too: a failed, stopped or interrupted
    // run never persists an audit, and nothing else names its directory.
    const runLocation = jobRunArtifactLocation(job);

    // A queued job has produced no audits. Deleting it only while it is
    // still unclaimed closes the race where the worker claims it between the
    // read above and the delete, which would leave a running pipeline with
    // no job row to report into. A job requeued after an interrupted run
    // keeps that run's directory, removed once the row is gone.
    if (job.status === 'queued') {
      const deleted = await deleteJob(connection, jobId, { onlyIfStatusNot: ['running'] });
      if (!deleted) {
        sendProblem(res, 409, {
          code: 'state-changed',
          message: 'the job has just started; stop it before deleting it',
          retryable: true,
        });
        return;
      }
      if (runLocation !== null && !(await removeArtifacts(runLocation))) return;
      sendJson(res, 200, { jobId, deleted: true, auditsDeleted: 0 });
      return;
    }

    const auditIds = new Set<string>();
    if (job.auditId !== undefined) auditIds.add(job.auditId);
    for (const id of job.auditIds ?? []) auditIds.add(id);
    for (const row of job.urlResults ?? []) {
      if (row.auditId !== undefined) auditIds.add(row.auditId);
    }

    if ([...auditIds].some((auditId) => isReportProductionInFlight(auditId))) {
      sendProblem(res, 409, {
        code: 'action-blocked',
        message: "a report is being produced for this job's audit; try again shortly",
        reasonCode: 'report-production-in-flight',
        retryable: true,
      });
      return;
    }

    for (const auditId of auditIds) {
      const audit = await getAudit(connection, auditId);
      if (audit !== null && !(await removeArtifacts(audit))) return;
      await deleteAuditCascade(connection, auditId);
    }
    if (runLocation !== null && !(await removeArtifacts(runLocation))) return;

    const deleted = await deleteJob(connection, jobId, { onlyIfStatusNot: ['queued', 'running'] });
    sendJson(res, 200, { jobId, deleted, auditsDeleted: auditIds.size });
  });
}
