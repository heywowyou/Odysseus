import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import {
  connectToMongo,
  createJob,
  disconnectFromMongo,
  getLatestHotelIngestRunId,
} from '@odysseus/store';
import {
  createAtoutFranceSource,
  createMongoHotelCandidateStore,
  getAtoutFranceExportPath,
  ingestHotelCatalogue,
  resolveHotels,
  CURRENT_RESOLUTION_VERSION,
} from '@odysseus/interface';
import { parsePositiveInt } from './shared.js';

/**
 * `prospect ingest` deliberately does not run the ingestion pipeline
 * inline: it creates a 'prospect-ingestion' job and exits, printing the
 * jobId. The actual work runs inside a live `odysseus serve` process's
 * JobQueue, per the explicit "JobQueue job type, not a standalone CLI
 * script" design decision for this milestone.
 *
 * `prospect hotel-ingest` (milestone 9c) deliberately diverges from that and
 * runs inline. The reasoning behind the job-queue rule was that the shipped
 * ingestion pipeline fetches candidate sites, so it needs the queue's
 * concurrency ceiling and politeness budget. The hotel catalogue ingest reads
 * a local open-data file the operator has already downloaded and writes
 * catalogue rows: no network, no Chromium, nothing to be polite to. Routing it
 * through the queue would add a running server as a prerequisite for a task
 * that has none.
 */
export function registerIngestCommands(prospect: Command): void {
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
    .command('hotel-ingest')
    .description(
      'Milestone 9c: read the downloaded Atout France classified-accommodation export into ' +
        'hotel_source_records and print a yield report. Runs inline; no `odysseus serve` process is needed.',
    )
    .option('--file <path>', 'Override the configured input path')
    .option('--limit <n>', 'Stop after this many accepted hotels', parsePositiveInt)
    .option('--dry-run', 'Parse and count without writing anything', false)
    .action(async (opts: { file?: string; limit?: number; dryRun: boolean }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        const source = createAtoutFranceSource({
          filePath: opts.file ?? getAtoutFranceExportPath(),
        });
        if (!opts.dryRun) mongoConnection = await connectToMongo();

        const report = await ingestHotelCatalogue({
          source,
          ingestRunId: randomUUID(),
          dryRun: opts.dryRun,
          ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
          ...(mongoConnection ? { connection: mongoConnection } : {}),
        });

        // Machine-readable on stdout: this report is the input to the
        // usable-domain measurement that decides whether a further
        // ingestion source is needed, so it must be parseable, not prose.
        console.log(JSON.stringify(report, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect hotel-ingest: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  prospect
    .command('hotel-resolve')
    .description(
      'Milestone 9c: resolve one ingest run of hotel_source_records into canonical hotel candidates, ' +
        'labelling chains, vendor-hosted independents, and review items. Runs inline.',
    )
    .option('--ingest-run <id>', 'Ingest run to resolve (default: the most recent)')
    .option(
      '--resolution-version <version>',
      'Resolution generation to write into',
      CURRENT_RESOLUTION_VERSION,
    )
    .option('--limit <n>', 'Stop after this many source records', parsePositiveInt)
    .option('--dry-run', 'Classify and count without writing anything', false)
    .action(
      async (opts: {
        ingestRun?: string;
        resolutionVersion: string;
        limit?: number;
        dryRun: boolean;
      }) => {
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          // Reading the catalogue needs a connection even for a dry run: the
          // source records being classified live in the database, unlike
          // hotel-ingest, whose input is a file on disk.
          mongoConnection = await connectToMongo();
          const ingestRunId = opts.ingestRun ?? (await getLatestHotelIngestRunId(mongoConnection));
          if (ingestRunId === null) {
            console.error(
              'odysseus prospect hotel-resolve: no hotel source records found. Run `prospect hotel-ingest` first.',
            );
            process.exitCode = 1;
            return;
          }

          const report = await resolveHotels({
            store: createMongoHotelCandidateStore(mongoConnection),
            ingestRunId,
            resolutionVersion: opts.resolutionVersion,
            dryRun: opts.dryRun,
            ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
          });

          // Machine-readable on stdout for the same reason hotel-ingest's
          // report is: this is the input to the usable-domain measurement that
          // decides whether a further ingestion source is needed.
          console.log(JSON.stringify(report, null, 2));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect hotel-resolve: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );
}
