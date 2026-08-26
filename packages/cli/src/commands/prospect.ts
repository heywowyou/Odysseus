/**
 * Milestone 9a CLI surface: a convenience for enqueuing an ingestion
 * batch from a terminal/cron rather than the dashboard route
 * (registerProspectingRoutes, packages/interface), and the minimal
 * intake path for the suppression collection - without it, that
 * collection exists but nothing in 9a can ever populate it (automated
 * opt-out processing from replies is milestone 9c's job).
 *
 * `prospect ingest` deliberately does not run the ingestion pipeline
 * inline: it creates a 'prospect-ingestion' job and exits, printing the
 * jobId. The actual work runs inside a live `odysseus serve` process's
 * JobQueue, per the explicit "JobQueue job type, not a standalone CLI
 * script" design decision for this milestone.
 */

import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import {
  connectToMongo,
  createJob,
  disconnectFromMongo,
  addSuppressionEntry,
} from '@odysseus/store';

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

export function registerProspectCommand(program: Command): void {
  const prospect = program
    .command('prospect')
    .description(
      'Milestone 9a: prospect acquisition and qualification against AFNIC + Sirene stock data.',
    );

  prospect
    .command('ingest')
    .description(
      'Enqueue one prospect-ingestion batch job. Requires a running `odysseus serve` process to pick it up ' +
        'and actually run the pipeline; this command only creates the job and prints its jobId.',
    )
    .option(
      '--batch-size <n>',
      'How many AFNIC candidates this batch targets (default ODYSSEUS_PROSPECT_BATCH_SIZE)',
      parsePositiveInt,
    )
    .action(async (opts: { batchSize?: number }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const job = await createJob(mongoConnection, {
          type: 'prospect-ingestion',
          options: opts.batchSize !== undefined ? { batchSize: opts.batchSize } : {},
        });
        console.log(`odysseus prospect ingest: enqueued job ${job.jobId}`);
        console.log('Run `odysseus serve` for a job queue that will pick this up.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect ingest: failed to enqueue\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  prospect
    .command('suppress <domain>')
    .description(
      'Record a permanent opt-out for a domain, never subject to the 90 day retention policy.',
    )
    .option('--address <email>', 'Optional address to suppress alongside the domain')
    .option('--reason <text>', 'Reason recorded with the suppression entry', 'operator request')
    .action(async (domain: string, opts: { address?: string; reason: string }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        await addSuppressionEntry(mongoConnection, {
          domain,
          ...(opts.address !== undefined ? { address: opts.address } : {}),
          reason: opts.reason,
        });
        console.log(
          `odysseus prospect suppress: recorded a permanent suppression entry for ${domain}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect suppress: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
