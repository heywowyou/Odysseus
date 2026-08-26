import type { Connection } from 'mongoose';
import { isValidSiren } from '@odysseus/core';
import { createJob, getJob, getSeverityRollups, listJobs, type JobOptionsSnapshot } from '@odysseus/store';
import type { Router } from '../router.js';
import { PayloadTooLargeError, readJsonBody, sendError, sendJson } from '../http-utils.js';
import type { JobQueue } from '../queue/job-queue.js';

/** Without the protocol check, any string that merely parses as a URL
 *  (including file:// and javascript:) was accepted and could reach the
 *  scanner's own navigation. */
function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Minimal glob shape check, not a compiler: routes/scans.ts's boundary
 *  only needs to reject garbage early (rule: fail fast at the boundary,
 *  same as siren), the actual matching happens in links.ts. Rejects
 *  empty strings and control characters; otherwise permissive. */
function isPlausibleGlob(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x1f]/.test(value);
}

/** Thrown only for siren: an invalid maxPages/maxDepth/delayMs is
 *  silently ignored (matching this function's existing behavior for
 *  those), but a manually supplied SIREN must fail fast rather than
 *  travel further into the pipeline, per the manual-SIREN milestone's
 *  design constraints - same checksum validation, same fail-fast
 *  behavior, as the CLI boundary. */
class OptionsValidationError extends Error {}

function parseOptionsSnapshot(raw: unknown): JobOptionsSnapshot {
  const options: JobOptionsSnapshot = {};
  if (raw === undefined || raw === null || typeof raw !== 'object') return options;
  const record = raw as Record<string, unknown>;
  if (typeof record['maxPages'] === 'number') options.maxPages = record['maxPages'];
  if (typeof record['maxDepth'] === 'number') options.maxDepth = record['maxDepth'];
  if (typeof record['delayMs'] === 'number') options.delayMs = record['delayMs'];

  const rawSiren = record['siren'];
  if (typeof rawSiren === 'string' && rawSiren.trim() !== '') {
    const cleaned = rawSiren.replace(/\s/g, '');
    if (!isValidSiren(cleaned)) {
      throw new OptionsValidationError('siren must be a valid SIREN (9 digits, passing the INSEE checksum)');
    }
    options.siren = cleaned;
  }

  if (typeof record['transactionalFlow'] === 'boolean') {
    options.transactionalFlow = record['transactionalFlow'];
  }
  if (typeof record['transactionalFlowReason'] === 'string' && record['transactionalFlowReason'].trim() !== '') {
    options.transactionalFlowReason = record['transactionalFlowReason'].trim();
  }

  const rawSeeds = record['seeds'];
  if (Array.isArray(rawSeeds) && rawSeeds.length > 0) {
    if (!rawSeeds.every(isValidUrl)) {
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
    if (!isValidUrl(rawBookingEngineUrl)) {
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
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        sendError(res, 413, 'request body is too large');
        return;
      }
      sendError(res, 400, 'request body must be valid JSON');
      return;
    }

    if (body === undefined || body === null || typeof body !== 'object') {
      sendError(res, 400, 'request body must be a JSON object');
      return;
    }
    const parsed = body as Record<string, unknown>;

    if (parsed['type'] === 'full-audit') {
      const url = parsed['url'];
      if (!isValidUrl(url)) {
        sendError(res, 400, 'url must be a valid URL');
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
      if (!Array.isArray(urls) || urls.length === 0 || !urls.every(isValidUrl)) {
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
    const jobs = await listJobs(connection, Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined);

    const auditIds = jobs.map((job) => job.auditId).filter((id): id is string => id !== undefined);
    const rollups = await getSeverityRollups(connection, auditIds);

    const summaries = jobs.map((job) => ({
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
}
