import { createServer, type Server } from 'node:http';
import type { Connection } from 'mongoose';
import { Router } from './router.js';
import { registerScanRoutes } from './routes/scans.js';
import { registerAuditRoutes } from './routes/audits.js';
import { registerProspectingRoutes } from './routes/prospecting.js';
import { registerProspectRoutes } from './routes/prospects.js';
import { registerProspectInsightRoutes } from './routes/prospect-insights.js';
import { registerOutreachRoutes } from './routes/outreach.js';
import { registerStaticFallback } from './routes/static.js';
import { JobQueue } from './queue/job-queue.js';
import { runFullAuditJob } from './queue/pipeline/run-full-audit-job.js';
import { runProspectingJob } from './queue/pipeline/run-prospecting-job.js';
import { runHotelPrescanJob } from './queue/pipeline/run-hotel-prescan-job.js';
import { runProspectIngestionJob } from './queue/pipeline/run-prospect-ingestion-job.js';
import { getInterfaceHost, getInterfacePort, getQueueConcurrency } from './config.js';
import { logger } from './logger.js';

export interface InterfaceServerHandle {
  server: Server;
  queue: JobQueue;
  url: string;
  close(): Promise<void>;
}

/** Boots the router, the job queue, and the node:http server, in that
 *  order, then starts the queue (which resets any job an unclean
 *  previous shutdown left 'running' back to 'queued' - see JobQueue.start
 *  and resetOrphanedRunningJobs). Binds to 127.0.0.1 by default: this is
 *  what makes it a private interface, not a public one. */
export async function startInterfaceServer(connection: Connection): Promise<InterfaceServerHandle> {
  const router = new Router();
  const queue = new JobQueue({
    connection,
    concurrency: getQueueConcurrency(),
    runners: {
      'full-audit': runFullAuditJob,
      prospecting: runProspectingJob,
      'prospect-ingestion': runProspectIngestionJob,
      'hotel-prescan': runHotelPrescanJob,
    },
  });

  registerScanRoutes(router, connection, queue);
  registerAuditRoutes(router, connection);
  registerProspectingRoutes(router, connection, queue);
  registerProspectRoutes(router, connection);
  registerProspectInsightRoutes(router, connection);
  registerOutreachRoutes(router, connection);
  registerStaticFallback(router);

  const server = createServer((req, res) => {
    void router.handle(req, res).catch((error: unknown) => {
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

  const host = getInterfaceHost();
  const port = getInterfacePort();

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
