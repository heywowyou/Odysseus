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

import { randomUUID } from 'node:crypto';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import {
  connectToMongo,
  createJob,
  disconnectFromMongo,
  addSuppressionEntry,
  getLatestHotelIngestRunId,
  getHotelCandidateYield,
  listHotelCandidates,
  recordHotelCandidateReview,
  getHotelQualificationYield,
  listHotelQualifications,
} from '@odysseus/store';
import { OriginLock, getCrawlDelayMs, getCrawlerUserAgent } from '@odysseus/scanner';
import { decideOverpassNeed, type HotelQualificationOutcome } from '@odysseus/core';
import {
  CURRENT_QUALIFICATION_VERSION,
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  checkHotelSite,
  createAtoutFranceSource,
  createHotelSireneJoiner,
  createMongoHotelQualificationStore,
  qualifyHotels,
  createMongoHotelCandidateStore,
  getAtoutFranceExportPath,
  getSireneStockIndexCachePath,
  getSireneStockPath,
  ingestHotelCatalogue,
  resolveHotels,
  CURRENT_RESOLUTION_VERSION,
} from '@odysseus/interface';

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
      'Prospect acquisition and qualification. Milestone 9a against AFNIC + Sirene stock data, ' +
        'milestone 9c against the Atout France hotel catalogue.',
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

          const sireneJoiner = await createHotelSireneJoiner(
            getSireneStockPath(),
            getSireneStockIndexCachePath(),
          );

          const report = await resolveHotels({
            store: createMongoHotelCandidateStore(mongoConnection),
            ingestRunId,
            resolutionVersion: opts.resolutionVersion,
            dryRun: opts.dryRun,
            sireneJoiner,
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

  const qualify = prospect
    .command('hotel-qualify')
    .description(
      'Milestone 9c: qualify campaign-ready hotel candidates with bounded DNS, TLS, and HTTP ' +
        'checks. No browser, no recipient contact. Runs inline.',
    );

  // A group with a `run` subcommand rather than an action command that also
  // has subcommands. The flat shape was tried and was quietly wrong: the
  // parent and `report`/`reasons` both need --qualification-version, Commander
  // binds the parent's copy, and the subcommand silently falls back to its
  // default. That failed as an empty result list, not an error, which is the
  // worst way for a reporting command to be wrong. Same shape as hotel-review
  // below, for the same reason.
  qualify
    .command('run')
    .description('Run the qualification pass over a resolution version.')
    .option(
      '--resolution-version <version>',
      'Resolution generation to qualify',
      CURRENT_RESOLUTION_VERSION,
    )
    .option(
      '--qualification-version <version>',
      'Qualification rule generation to write into',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--limit <n>', 'Stop after this many candidates', parsePositiveInt)
    .option('--concurrency <n>', 'Candidates in flight at once', parsePositiveInt, 3)
    .option(
      '--resume',
      'Skip candidates already carrying a verdict at this qualification version',
      false,
    )
    .option(
      '--dry-run',
      'Count what would be checked, contacting nobody and writing nothing',
      false,
    )
    .action(
      async (opts: {
        resolutionVersion: string;
        qualificationVersion: string;
        limit?: number;
        concurrency: number;
        resume: boolean;
        dryRun: boolean;
      }) => {
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          // A connection even for a dry run: unlike hotel-ingest, the input is
          // the catalogue in the database, not a file on disk. The dry run
          // still makes no third-party request and writes nothing.
          mongoConnection = await connectToMongo();

          // One lock for the whole run, shared across every lane. A few hundred
          // hotels sit behind one vendor host; without a shared lock, each lane
          // would look individually polite while that host took every lane's
          // request at once.
          const originLock = new OriginLock();
          const checkOptions = {
            crawlDelayMs: getCrawlDelayMs(),
            userAgent: getCrawlerUserAgent(),
            timeoutMs: DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
          };

          const report = await qualifyHotels({
            store: createMongoHotelQualificationStore(mongoConnection),
            checkSite: (domain: string) => checkHotelSite(domain, originLock, checkOptions),
            resolutionVersion: opts.resolutionVersion,
            qualificationVersion: opts.qualificationVersion,
            concurrency: opts.concurrency,
            resume: opts.resume,
            dryRun: opts.dryRun,
            ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
            onProgress: (evaluated: number) => {
              // stderr, so stdout stays a single parseable JSON document.
              process.stderr.write(`qualified ${evaluated} candidates\n`);
            },
          });

          console.log(JSON.stringify(report, null, 2));

          // Null on a dry run, and a dry run has measured no yield to decide on.
          if (report.overpass === 'propose') {
            console.error(
              'odysseus prospect hotel-qualify: qualified own-domain yield is below the 8,000 ' +
                'target floor. Binding decision 3 requires presenting the measured shortfall and ' +
                'an Overpass adapter plan for approval before any new source is ingested.',
            );
          }
          if (!report.reconciles) {
            console.error(
              'odysseus prospect hotel-qualify: outcome counts do not reconcile with the number ' +
                'evaluated. Treat this report as unreliable rather than as a result.',
            );
            process.exitCode = 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect hotel-qualify: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  qualify
    .command('report')
    .description('Print the coverage and loss-reason table for a qualification version.')
    .option(
      '--qualification-version <version>',
      'Qualification generation to summarize',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option(
      '--resolution-version <version>',
      'Resolution generation to summarize alongside it',
      CURRENT_RESOLUTION_VERSION,
    )
    .action(async (opts: { qualificationVersion: string; resolutionVersion: string }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const qualification = await getHotelQualificationYield(
          mongoConnection,
          opts.qualificationVersion,
        );
        const catalogue = await getHotelCandidateYield(mongoConnection, opts.resolutionVersion);
        console.log(
          JSON.stringify(
            {
              resolutionVersion: opts.resolutionVersion,
              qualificationVersion: opts.qualificationVersion,
              catalogue,
              qualification,
              // Printed rather than acted on: binding decision 3 requires the
              // shortfall to be presented for approval, not resolved by a
              // command.
              overpass: decideOverpassNeed(qualification.byOutcome.qualified),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect hotel-qualify report: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  qualify
    .command('reasons')
    .description('List individual parked or rejected candidates and why.')
    .option(
      '--qualification-version <version>',
      'Qualification generation to read',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--outcome <outcome>', 'qualified | parked | rejected | already-engaged | group-routed')
    .option('--limit <n>', 'Maximum rows to print', parsePositiveInt, 50)
    .action(async (opts: { qualificationVersion: string; outcome?: string; limit: number }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const rows = await listHotelQualifications(
          mongoConnection,
          {
            qualificationVersion: opts.qualificationVersion,
            ...(opts.outcome === undefined
              ? {}
              : { outcome: opts.outcome as HotelQualificationOutcome }),
          },
          opts.limit,
        );
        console.log(
          JSON.stringify(
            rows.map((row) => ({
              candidateId: row.candidateId,
              domain: row.domain,
              outcome: row.outcome,
              reasons: row.reasons,
              notes: row.notes,
              finalUrl: row.siteFacts.finalUrl ?? null,
              evaluatedAt: row.evaluatedAt,
            })),
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect hotel-qualify reasons: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  const review = prospect
    .command('hotel-review')
    .description(
      'Milestone 9c: inspect and decide the hotel candidates resolution could not merge on exact evidence.',
    );

  review
    .command('list')
    .description('List candidates awaiting review, or filter by review state.')
    .option(
      '--resolution-version <version>',
      'Resolution generation to read',
      CURRENT_RESOLUTION_VERSION,
    )
    .option('--state <state>', 'not-required | pending | accepted | rejected', 'pending')
    .option('--limit <n>', 'Maximum candidates to print', parsePositiveInt, 50)
    .action(async (opts: { resolutionVersion: string; state: string; limit: number }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const candidates = await listHotelCandidates(
          mongoConnection,
          {
            resolutionVersion: opts.resolutionVersion,
            reviewState: opts.state as 'not-required' | 'pending' | 'accepted' | 'rejected',
          },
          opts.limit,
        );
        const summary = await getHotelCandidateYield(mongoConnection, opts.resolutionVersion);
        console.log(
          JSON.stringify(
            {
              summary,
              candidates: candidates.map((candidate) => ({
                candidateId: candidate.candidateId,
                name: candidate.name,
                postcode: candidate.postcode,
                commune: candidate.commune,
                starRating: candidate.starRating,
                groupStatus: candidate.groupStatus,
                groupDomain: candidate.groupDomain,
                groupSize: candidate.groupSize,
                ownRegistrableDomain: candidate.ownRegistrableDomain,
                declaredWebsites: candidate.websiteCandidates.map((site) => site.raw),
                queuedReason: candidate.review.queuedReason,
                conflicts: candidate.conflicts,
              })),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect hotel-review list: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  for (const decision of ['accept', 'reject'] as const) {
    review
      .command(`${decision} <candidateId>`)
      .description(
        `Record a reviewed ${decision === 'accept' ? 'acceptance' : 'rejection'} for one candidate. ` +
          'Idempotent: re-running the same decision reports no change rather than failing.',
      )
      .requiredOption('--actor <name>', 'Who made this decision, recorded on the candidate')
      .requiredOption('--reason <text>', 'Why, recorded on the candidate')
      .action(async (candidateId: string, opts: { actor: string; reason: string }) => {
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const result = await recordHotelCandidateReview(mongoConnection, {
            candidateId,
            decision: decision === 'accept' ? 'accepted' : 'rejected',
            actor: opts.actor,
            reason: opts.reason,
          });
          if (!result.found) {
            console.error(
              `odysseus prospect hotel-review ${decision}: no candidate with id ${candidateId}`,
            );
            process.exitCode = 1;
            return;
          }
          console.log(
            result.changed
              ? `odysseus prospect hotel-review ${decision}: recorded for ${candidateId}`
              : `odysseus prospect hotel-review ${decision}: already recorded for ${candidateId}, nothing changed`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect hotel-review ${decision}: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      });
  }

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
