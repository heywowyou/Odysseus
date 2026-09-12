import type { Connection } from 'mongoose';
import { promises as fs } from 'node:fs';
import { isHttpUrlWithoutCredentials, isValidSiren } from '@odysseus/core';
import {
  cancelJob,
  cancelQueuedJobs,
  createJob,
  deleteAuditCascade,
  deleteJob,
  getAudit,
  getHotelCandidatesByIds,
  getJob,
  listJobs,
  type JobOptionsSnapshot,
} from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import type { Router } from '../router.js';
import { jsonBodyNotRead, readJsonBodyOrRespond, sendError, sendJson } from '../http-utils.js';
import type { JobQueue } from '../queue/job-queue.js';
import { getSeverityRollupsForPoll } from './severity-rollup-cache.js';

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

    if (parsed['type'] === 'full-audit') {
      const url = parsed['url'];
      if (!isHttpUrlWithoutCredentials(url)) {
        sendError(res, 400, 'url must be an absolute http(s) URL without embedded credentials');
        return;
      }
      let options: JobOptionsSnapshot;
      try {
        options = parseOptionsSnapshot(parsed['options']);
      } catch (error) {
        sendError(res, 400, error instanceof Error ? error.message : 'invalid options');
        return;
      }

      const job = await createJob(connection, {
        type: 'full-audit',
        siteUrl: url,
        options,
      });
      queue.notify();
      sendJson(res, 201, { jobId: job.jobId });
      return;
    }

    if (parsed['type'] === 'prospecting') {
      const urls = parsed['urls'];
      if (!Array.isArray(urls) || urls.length === 0 || !urls.every(isHttpUrlWithoutCredentials)) {
        sendError(res, 400, 'urls must be a non-empty array of valid URLs');
        return;
      }
      const job = await createJob(connection, { type: 'prospecting', urls, options: {} });
      queue.notify();
      sendJson(res, 201, { jobId: job.jobId });
      return;
    }

    sendError(res, 400, 'type must be "full-audit" or "prospecting"');
  });

  router.get('/api/scans', async ({ res, query }) => {
    const limitParam = query.get('limit');
    const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
    const jobs = await listJobs(
      connection,
      Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined,
    );

    const auditIds = jobs.map((job) => job.auditId).filter((id): id is string => id !== undefined);
    const rollups = await getSeverityRollupsForPoll(connection, auditIds);

    // Plan 042 slice 4: the hotel name behind each prospect-linked job,
    // one batched read for the page's distinct candidates. A candidate
    // that no longer resolves simply carries no name.
    const candidateIds = [
      ...new Set(
        jobs.map((job) => job.outreachCandidateId).filter((id): id is string => id !== undefined),
      ),
    ];
    const candidates = await getHotelCandidatesByIds(connection, candidateIds);
    const candidateNames = new Map(
      candidates.map((candidate) => [candidate.candidateId, candidate.name]),
    );

    const summaries = jobs.map((job) => ({
      outreachCandidateId: job.outreachCandidateId,
      outreachCandidateName:
        job.outreachCandidateId !== undefined
          ? candidateNames.get(job.outreachCandidateId)
          : undefined,
      jobId: job.jobId,
      type: job.type,
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
    }));

    sendJson(res, 200, summaries);
  });

  router.get('/api/scans/:jobId', async ({ res, params }) => {
    const job = await getJob(connection, params['jobId']!);
    if (!job) {
      sendError(res, 404, 'job not found');
      return;
    }
    sendJson(res, 200, job);
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
      job.type !== 'prospecting' &&
      job.type !== 'hotel-prescan'
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
   *  artifacts directory. Running jobs are refused (stop first), so a
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

    const auditIds = new Set<string>();
    if (job.auditId !== undefined) auditIds.add(job.auditId);
    for (const id of job.auditIds ?? []) auditIds.add(id);
    for (const row of job.urlResults ?? []) {
      if (row.auditId !== undefined) auditIds.add(row.auditId);
    }

    for (const auditId of auditIds) {
      const audit = await getAudit(connection, auditId);
      if (audit !== null) {
        const auditDir = buildAuditDir(
          getArtifactsRoot(),
          new URL(audit.siteUrl).hostname,
          audit.startedAt,
        );
        // force: artifacts may already be gone (retention sweep, or the
        // pre-move audits that never left the old machine).
        await fs.rm(auditDir, { recursive: true, force: true });
      }
      await deleteAuditCascade(connection, auditId);
    }

    const deleted = await deleteJob(connection, jobId);
    sendJson(res, 200, { jobId, deleted, auditsDeleted: auditIds.size });
  });
}
