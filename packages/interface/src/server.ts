import { createServer, type Server } from 'node:http';
import type { Connection } from 'mongoose';
import { Router } from './router.js';
import { registerScanRoutes } from './routes/scans.js';
import { registerAuditRoutes } from './routes/audits.js';
import { registerStaticFallback } from './routes/static.js';
import { JobQueue } from './queue/job-queue.js';
import { runFullAuditJob } from './queue/pipeline/run-full-audit-job.js';
import { runProspectingJob } from './queue/pipeline/run-prospecting-job.js';
import { getInterfaceHost, getInterfacePort, getQueueConcurrency } from './config.js';

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
    runFullAuditJob,
    runProspectingJob,
  });

  registerScanRoutes(router, connection, queue);
  registerAuditRoutes(router, connection);
  registerStaticFallback(router);

  const server = createServer((req, res) => {
    void router.handle(req, res).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify({ error: message }));
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
    console.log(`odysseus serve: reset ${orphanedCount} job(s) left running by an unclean shutdown`);
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
