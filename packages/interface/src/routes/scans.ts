import type { Connection } from 'mongoose';
import { createJob, getJob, getSeverityRollups, listJobs, type JobOptionsSnapshot } from '@odysseus/store';
import type { Router } from '../router.js';
import { readJsonBody, sendError, sendJson } from '../http-utils.js';
import type { JobQueue } from '../queue/job-queue.js';

function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function parseOptionsSnapshot(raw: unknown): JobOptionsSnapshot {
  const options: JobOptionsSnapshot = {};
  if (raw === undefined || raw === null || typeof raw !== 'object') return options;
  const record = raw as Record<string, unknown>;
  if (typeof record['maxPages'] === 'number') options.maxPages = record['maxPages'];
  if (typeof record['maxDepth'] === 'number') options.maxDepth = record['maxDepth'];
  if (typeof record['delayMs'] === 'number') options.delayMs = record['delayMs'];
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
    } catch {
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
      const job = await createJob(connection, {
        type: 'full-audit',
        siteUrl: url,
        options: parseOptionsSnapshot(parsed['options']),
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
