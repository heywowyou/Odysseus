import type { Connection } from 'mongoose';
import { createJob } from '@odysseus/store';
import type { Router } from '../router.js';
import { sendJson } from '../http-utils.js';
import type { JobQueue } from '../queue/job-queue.js';

/** Makes "wired into the JobQueue/dashboard infrastructure from day one"
 *  concrete beyond internal dispatch: lets a running `odysseus serve`
 *  actually be told to enqueue an ingestion batch, mirroring
 *  registerScanRoutes's shape. A full dashboard UI page (funnel
 *  visualization, qualified-prospect table) is not built in milestone 9a -
 *  the existing app-*.ts dashboard files are audit-scan-shaped, not
 *  prospect-shaped; that's a reasonable follow-up, not part of this. */
export function registerProspectingRoutes(
  router: Router,
  connection: Connection,
  queue: JobQueue,
): void {
  router.post('/api/prospecting/ingest', async ({ res }) => {
    const job = await createJob(connection, { type: 'prospect-ingestion', options: {} });
    queue.notify();
    sendJson(res, 201, { jobId: job.jobId });
  });
}
