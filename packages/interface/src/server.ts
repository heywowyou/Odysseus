import { createServer, type Server } from 'node:http';
import type { Connection } from 'mongoose';
import { Router } from './router.js';
import { registerScanRoutes } from './routes/scans.js';
import { registerAuditRoutes } from './routes/audits.js';
import { registerReportPreparationRoutes } from './routes/report-preparation.js';
import { registerProspectingRoutes } from './routes/prospecting.js';
import { registerProspectRoutes } from './routes/prospects.js';
import { registerProspectContactRoutes } from './routes/prospect-contact.js';
import { registerProspectInsightRoutes } from './routes/prospect-insights.js';
import { registerOutreachRoutes } from './routes/outreach.js';
import { registerStaticFallback } from './routes/static.js';
import { createAuthGuard, type AuthGuard } from './auth/auth-guard.js';
import { applyBaseSecurityHeaders } from './security-headers.js';
import { registerSessionRoutes } from './auth/session-routes.js';
import { createLoginRateLimiter, type LoginRateLimiter } from './auth/rate-limit.js';
import { createInMemorySessionStore, type SessionStore } from './auth/session-store.js';
import { JobQueue } from './queue/job-queue.js';
import { runFullAuditJob } from './queue/pipeline/run-full-audit-job.js';
import { runOutreachFullScanJob } from './queue/pipeline/run-outreach-full-scan-job.js';
import { runProspectingJob } from './queue/pipeline/run-prospecting-job.js';
import { runHotelPrescanJob } from './queue/pipeline/run-hotel-prescan-job.js';
import { runProspectIngestionJob } from './queue/pipeline/run-prospect-ingestion-job.js';
import { runOutreachDraftBatchJob } from './queue/pipeline/run-outreach-draft-batch-job.js';
import { runOutreachFollowupBatchJob } from './queue/pipeline/run-outreach-followup-batch-job.js';
import {
  DASHBOARD_PASSWORD_HASH_ENV_VAR,
  getDashboardPasswordHash,
  getInterfaceHost,
  getInterfacePort,
  getQueueConcurrency,
} from './config.js';
import { logger } from './logger.js';

export interface InterfaceServerHandle {
  server: Server;
  queue: JobQueue;
  url: string;
  close(): Promise<void>;
}

export interface InterfaceAuthOptions {
  getPasswordHash?: () => string | null;
  now?: () => number;
  sessionStore?: SessionStore;
  rateLimiter?: LoginRateLimiter;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function refusesUnprotectedNonLoopbackBind(host: string, authConfigured: boolean): boolean {
  if (authConfigured) return false;
  return !LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

export async function startInterfaceServer(
  connection: Connection,
  options: InterfaceAuthOptions = {},
): Promise<InterfaceServerHandle> {
  const getPasswordHash = options.getPasswordHash ?? getDashboardPasswordHash;
  const configuredHash = getPasswordHash();
  const host = getInterfaceHost();
  const port = getInterfacePort();

  if (refusesUnprotectedNonLoopbackBind(host, configuredHash !== null)) {
    throw new Error(
      `refusing to bind the dashboard to ${host}: ${DASHBOARD_PASSWORD_HASH_ENV_VAR} is ` +
        'not set, and a non-loopback bind without authentication would expose every ' +
        'prospect, audit and draft to the open internet. Generate a hash with ' +
        'scripts/hash-dashboard-password.mjs, or keep ODYSSEUS_INTERFACE_HOST on loopback.',
    );
  }

  const router = new Router();
  const queue = new JobQueue({
    connection,
    concurrency: getQueueConcurrency(),
    runners: {
      'full-audit': runFullAuditJob,
      'outreach-full-scan': runOutreachFullScanJob,
      prospecting: runProspectingJob,
      'prospect-ingestion': runProspectIngestionJob,
      'hotel-prescan': runHotelPrescanJob,
      'outreach-draft-batch': runOutreachDraftBatchJob,
      'outreach-followup-batch': runOutreachFollowupBatchJob,
    },
  });

  const clock = options.now ? { now: options.now } : {};
  const sessionStore: SessionStore = options.sessionStore ?? createInMemorySessionStore(clock);
  const rateLimiter: LoginRateLimiter = options.rateLimiter ?? createLoginRateLimiter(clock);

  registerScanRoutes(router, connection, queue);
  registerAuditRoutes(router, connection);
  registerReportPreparationRoutes(router, connection);
  registerProspectingRoutes(router, connection, queue);
  registerProspectRoutes(router, connection, queue);
  registerProspectContactRoutes(router, connection);
  registerProspectInsightRoutes(router, connection);
  registerOutreachRoutes(router, connection, queue);
  registerSessionRoutes(router, { getPasswordHash, sessionStore, rateLimiter });
  registerStaticFallback(router);

  let guard: AuthGuard | undefined;
  if (configuredHash !== null) {
    guard = createAuthGuard({ sessionStore });
  }

  const server = createServer((req, res) => {
    applyBaseSecurityHeaders(res);
    void (async () => {
      if (guard !== undefined && !(await guard(req, res))) return;
      await router.handle(req, res);
    })().catch((error: unknown) => {
      logger.error(
        { err: error, method: req.method, url: req.url },
        'unhandled error while handling request',
      );
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const orphanedCount = await queue.start();
  if (orphanedCount > 0) {
    logger.info({ orphanedCount }, 'reset job(s) left running by an unclean shutdown');
  }

  return {
    server,
    queue,
    url: `http://${host}:${port}`,
    async close(): Promise<void> {
      await queue.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
