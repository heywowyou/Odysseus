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
  getPrescanSummary,
  listCandidatesToPrescan,
  getPrescanVendorAggregate,
  getHotelScoreSummary,
  diffHotelScoreVersions,
  getLatestScoreCohort,
  getHotelContactSummary,
  listHotelContacts,
} from '@odysseus/store';
import {
  OriginLock,
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getPrescansRoot,
  sweepExpiredPrescanArtifacts,
} from '@odysseus/scanner';
import {
  decideOverpassNeed,
  type HotelContactState,
  type HotelQualificationOutcome,
} from '@odysseus/core';
import {
  CURRENT_QUALIFICATION_VERSION,
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  checkHotelSite,
  createAtoutFranceSource,
  createHotelSireneJoiner,
  createMongoHotelQualificationStore,
  createMongoReconcileRedirectsStore,
  createMongoBackfillSireneStore,
  backfillSirene,
  qualifyHotels,
  reconcileRedirects,
  createMongoHotelCandidateStore,
  getAtoutFranceExportPath,
  getSireneStockIndexCachePath,
  getSireneStockPath,
  ingestHotelCatalogue,
  resolveHotels,
  CURRENT_RESOLUTION_VERSION,
  CURRENT_PRESCAN_VERSION,
  CURRENT_SCORING_VERSION,
  createMongoCohortSelectionStore,
  createMongoHotelScoringStore,
  scoreHotels,
  selectCohort,
  CURRENT_CONTACT_VERSION,
  createMongoHotelContactStore,
  discoverContacts,
  fetchContactPages,
  verifyMailDomain,
} from '@odysseus/interface';

/** Read ceiling for a prescan dry run, which takes no --limit because it
 *  contacts nobody. High enough to cover the whole qualified population, low
 *  enough that a mistake cannot stream an unbounded collection into memory. */
const DRY_RUN_PLAN_CEILING = 10_000;

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

          // Built here rather than inside qualifyHotels so a missing stock
          // file is reported once, at startup, instead of per candidate. The
          // joiner itself degrades to `stock-file-unavailable` rather than
          // throwing, because a run's verdicts must not be lost for want of an
          // optional input.
          const sireneJoiner = await createHotelSireneJoiner(
            getSireneStockPath(),
            getSireneStockIndexCachePath(),
          );
          if (sireneJoiner.stockVersion === null) {
            console.error(
              `odysseus prospect hotel-qualify: no INSEE stock file at ${getSireneStockPath()}. ` +
                'Company size will be unknown for every hotel, so the effectif rule cannot ' +
                'reject anyone and the effectif score component stays at zero. Download the ' +
                'stock file or set ODYSSEUS_SIRENE_STOCK_PATH to run this pass fully.',
            );
          }

          const report = await qualifyHotels({
            store: createMongoHotelQualificationStore(mongoConnection),
            checkSite: (domain: string) => checkHotelSite(domain, originLock, checkOptions),
            sireneJoiner,
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
    .command('reconcile-redirects')
    .description(
      'Re-decide the verdicts whose declared site redirected elsewhere, and write the result ' +
        'as a new complete qualification generation. A target several establishments reach is ' +
        "a chain; one exactly one establishment holds is that hotel's own, and is adopted and " +
        'checked on its own merits.',
    )
    .option(
      '--resolution-version <version>',
      'Resolution generation the verdicts belong to',
      CURRENT_RESOLUTION_VERSION,
    )
    .requiredOption('--from-version <version>', 'Qualification generation to read')
    .option(
      '--to-version <version>',
      'Qualification generation to write',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--limit <n>', 'Re-probe at most this many adopted domains', parsePositiveInt)
    .option('--concurrency <n>', 'Domains in flight at once', parsePositiveInt, 3)
    .option(
      '--dry-run',
      'Classify and report the request budget, contacting nobody and writing nothing',
      false,
    )
    .action(
      async (opts: {
        resolutionVersion: string;
        fromVersion: string;
        toVersion: string;
        limit?: number;
        concurrency: number;
        dryRun: boolean;
      }) => {
        // Bounded like every other batch, and for the same reason: the adopted
        // domains are live third-party sites. The classification and the
        // copy-forward touch nobody, so only the re-probe is capped.
        if (!opts.dryRun && opts.limit === undefined) {
          console.error(
            'odysseus prospect hotel-qualify reconcile-redirects: --limit is required. Adopted ' +
              'domains are fetched, and binding decision 18 requires every batch to be bounded.',
          );
          process.exitCode = 1;
          return;
        }

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const originLock = new OriginLock();
          const report = await reconcileRedirects({
            store: createMongoReconcileRedirectsStore(mongoConnection),
            checkSite: (domain: string) =>
              checkHotelSite(domain, originLock, {
                crawlDelayMs: getCrawlDelayMs(),
                userAgent: getCrawlerUserAgent(),
                timeoutMs: DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
              }),
            resolutionVersion: opts.resolutionVersion,
            fromVersion: opts.fromVersion,
            toVersion: opts.toVersion,
            concurrency: opts.concurrency,
            dryRun: opts.dryRun,
            ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
            onProgress: (reprobed: number) => {
              process.stderr.write(`re-probed ${reprobed} adopted domains\n`);
            },
          });
          console.log(JSON.stringify(report, null, 2));

          // A generation that does not cover every source row is not a
          // generation: listCandidatesToPrescan filters on the version, so a
          // short one silently shrinks the prescan population.
          if (!opts.dryRun && report.rowsWritten !== report.rowsRead) {
            console.error(
              `odysseus prospect hotel-qualify reconcile-redirects: wrote ${report.rowsWritten} ` +
                `rows against ${report.rowsRead} read. Generation '${opts.toVersion}' is ` +
                'incomplete and must not be used for selection.',
            );
            process.exitCode = 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect hotel-qualify reconcile-redirects: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  qualify
    .command('backfill-sirene')
    .description(
      'Attach the INSEE join to an already-qualified generation and write the result as a new ' +
        'complete generation. Contacts nobody: the identifier is already stored on every row, ' +
        "so this needs the stock file and the database, not the catalogue's websites.",
    )
    .option(
      '--resolution-version <version>',
      'Resolution generation the verdicts belong to',
      CURRENT_RESOLUTION_VERSION,
    )
    .requiredOption('--from-version <version>', 'Qualification generation to read')
    .option(
      '--to-version <version>',
      'Qualification generation to write',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--dry-run', 'Report the verdicts it would write, writing nothing', false)
    .action(
      async (opts: {
        resolutionVersion: string;
        fromVersion: string;
        toVersion: string;
        dryRun: boolean;
      }) => {
        // No --limit, unlike reconcile-redirects. That option exists there to
        // bound the only part that contacts anybody; nothing here does, and a
        // partial generation is never the right answer.

        // Built before connecting, so an operator who has not placed the stock
        // file is told so immediately rather than after a database round trip.
        // `backfillSirene` refuses the same case itself; this only moves the
        // message earlier.
        const sireneJoiner = await createHotelSireneJoiner(
          getSireneStockPath(),
          getSireneStockIndexCachePath(),
        );
        if (sireneJoiner.stockVersion === null) {
          console.error(
            `odysseus prospect hotel-qualify backfill-sirene: no INSEE stock file at ` +
              `${getSireneStockPath()}. This pass has nothing else to write, so it would ` +
              'produce a generation recording stock-file-unavailable for every hotel. ' +
              'Download the stock file or set ODYSSEUS_SIRENE_STOCK_PATH.',
          );
          process.exitCode = 1;
          return;
        }

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const report = await backfillSirene({
            store: createMongoBackfillSireneStore(mongoConnection),
            sireneJoiner,
            resolutionVersion: opts.resolutionVersion,
            fromVersion: opts.fromVersion,
            toVersion: opts.toVersion,
            dryRun: opts.dryRun,
            onProgress: (rowsProcessed: number) => {
              process.stderr.write(`processed ${rowsProcessed} rows\n`);
            },
          });
          console.log(JSON.stringify(report, null, 2));

          // Same completeness check reconcile-redirects makes, for the same
          // reason: listCandidatesToPrescan filters on the version, so a short
          // generation silently shrinks the prescan population.
          if (!opts.dryRun && report.rowsWritten !== report.rowsRead) {
            console.error(
              `odysseus prospect hotel-qualify backfill-sirene: wrote ${report.rowsWritten} ` +
                `rows against ${report.rowsRead} read. Generation '${opts.toVersion}' is ` +
                'incomplete and must not be used for selection.',
            );
            process.exitCode = 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect hotel-qualify backfill-sirene: failed\n${message}`);
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

  const prescan = prospect
    .command('prescan')
    .description(
      'Milestone 9c: prescan qualified hotels with a bounded three-page browser pass. ' +
        'No Lighthouse, no paid-audit records.',
    );

  // Enqueued rather than run inline, unlike hotel-qualify. This is the
  // distinction this file's header draws: hotel-qualify makes plain bounded
  // HTTP requests, while a prescan drives Chromium against live third-party
  // sites, which is exactly the work the queue's concurrency ceiling, its
  // per-origin lock, and its politeness budget exist to bound. A dry run is
  // the exception below, because it contacts nobody.
  prescan
    .command('run')
    .description('Enqueue a prescan batch over the qualified candidates of a resolution version.')
    .option(
      '--resolution-version <version>',
      'Resolution generation to prescan',
      CURRENT_RESOLUTION_VERSION,
    )
    .option(
      '--qualification-version <version>',
      'Qualification generation whose qualified candidates are eligible',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option(
      '--prescan-version <version>',
      'Prescan rule generation to write into',
      CURRENT_PRESCAN_VERSION,
    )
    .option('--limit <n>', 'Prescan at most this many hotels', parsePositiveInt)
    .option(
      '--domain <registrable-domain>',
      'Prescan only this hotel, by its own registrable domain. A batch authorized ' +
        'for one named site must say so here: --limit alone bounds the batch but ' +
        'does not choose which site it visits.',
    )
    .option('--concurrency <n>', 'Hotels in flight at once', parsePositiveInt, 3)
    .option('--rescan', 'Measure again even where a prescan exists at this version', false)
    .option(
      '--dry-run',
      'List what would be prescanned and its page budget, contacting nobody',
      false,
    )
    .action(
      async (opts: {
        resolutionVersion: string;
        qualificationVersion: string;
        prescanVersion: string;
        limit?: number;
        domain?: string;
        concurrency: number;
        rescan: boolean;
        dryRun: boolean;
      }) => {
        // Checked before anything is opened, not inside the try below: a run
        // with no bound is refused on its arguments alone, so the refusal
        // costs no database connection and cannot be confused with a
        // connection failure. A dry run is exempt because it contacts nobody.
        // --domain satisfies the same requirement by a different route: one
        // named site is already a bound, and a narrower one than a count,
        // because it names which site rather than only how many.
        if (!opts.dryRun && opts.limit === undefined && opts.domain === undefined) {
          console.error(
            'odysseus prospect prescan run: --limit or --domain is required. The qualified ' +
              'population is thousands of live third-party sites, and binding decision 18 ' +
              'requires every batch to be bounded.',
          );
          process.exitCode = 1;
          return;
        }

        // A dry run plans over the whole qualified population, so it needs no
        // bound of its own; this ceiling only stops an unbounded read. A named
        // domain falls back to one site rather than to that ceiling: a domain
        // is the identity of a single establishment wherever it qualifies at
        // all, so anything above one would be a catalogue fault, and inheriting
        // a four-figure ceiling would hide it.
        const limit = opts.limit ?? (opts.domain === undefined ? DRY_RUN_PLAN_CEILING : 1);

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();

          if (opts.dryRun) {
            // Planned here rather than by enqueuing a job that would then
            // decline to do anything: a dry run launches no browser and makes
            // no request, so it has no reason to need a running server. It
            // reports the population and the page budget, never an outcome -
            // see prescan-hotels.ts on why a plan must not report outcomes it
            // did not observe.
            const candidates = await listCandidatesToPrescan(mongoConnection, {
              resolutionVersion: opts.resolutionVersion,
              qualificationVersion: opts.qualificationVersion,
              prescanVersion: opts.prescanVersion,
              limit,
              ...(opts.domain === undefined ? {} : { domain: opts.domain }),
              skipAlreadyPrescanned: !opts.rescan,
            });
            console.log(
              JSON.stringify(
                {
                  dryRun: true,
                  resolutionVersion: opts.resolutionVersion,
                  qualificationVersion: opts.qualificationVersion,
                  prescanVersion: opts.prescanVersion,
                  concurrency: opts.concurrency,
                  rescan: opts.rescan,
                  ...(opts.domain === undefined ? {} : { domain: opts.domain }),
                  plan: {
                    candidatesConsidered: candidates.length,
                    wouldPrescan: candidates.length,
                    // Three pages per site is the cap, not the expectation: a
                    // site with no booking or rooms page has fewer roles to
                    // fill, so a real run lands below this.
                    maxPagesLoaded: candidates.length * 3,
                  },
                  domains: candidates.slice(0, 25).map((row) => row.ownRegistrableDomain),
                },
                null,
                2,
              ),
            );
            return;
          }

          const job = await createJob(mongoConnection, {
            type: 'hotel-prescan',
            options: {
              resolutionVersion: opts.resolutionVersion,
              qualificationVersion: opts.qualificationVersion,
              prescanVersion: opts.prescanVersion,
              maxPages: limit,
              ...(opts.domain === undefined ? {} : { domain: opts.domain }),
              concurrency: opts.concurrency,
              rescan: opts.rescan,
            },
          });
          console.log(`odysseus prospect prescan run: enqueued job ${job.jobId}`);
          console.log(
            'Run `odysseus serve` for a job queue that will pick this up. The queue is what ' +
              'applies the per-origin lock and the crawl delay.',
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect prescan run: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  prescan
    .command('report')
    .description('Print the outcome table for a prescan version.')
    .option(
      '--prescan-version <version>',
      'Prescan generation to summarize',
      CURRENT_PRESCAN_VERSION,
    )
    .action(async (opts: { prescanVersion: string }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const summary = await getPrescanSummary(mongoConnection, opts.prescanVersion);
        console.log(JSON.stringify(summary, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect prescan report: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });

  prescan
    .command('cleanup')
    .description('List expired prescan artifacts, or remove them when --apply is explicit.')
    .requiredOption('--limit <n>', 'Inspect at most this many prescan manifests', parsePositiveInt)
    .option('--apply', 'Remove the listed expired prescan directories', false)
    .action(async (opts: { limit: number; apply: boolean }) => {
      try {
        const report = await sweepExpiredPrescanArtifacts(getPrescansRoot(), {
          dryRun: !opts.apply,
          limit: opts.limit,
        });
        console.log(JSON.stringify(report, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect prescan cleanup: failed\n${message}`);
        process.exitCode = 1;
      }
    });

  // Milestone 9c plan 006. A group with a `run` child rather than a flat action
  // command, for the reason hotel-qualify's own comment gives: siblings sharing
  // an option name silently bind the parent's copy otherwise.
  //
  // Every one of these runs inline. Scoring reads only what earlier passes
  // stored, so it contacts nobody, launches no browser, and has nothing to be
  // polite to - the queue's origin lock and crawl delay would bound a run that
  // makes no requests.
  const scoreCommand = prospect
    .command('score')
    .description(
      'Milestone 9c: score prescanned hotels into immutable versioned records, and select a cohort from them.',
    );

  scoreCommand
    .command('run')
    .description('Score the prescanned candidates of a resolution version.')
    .option(
      '--resolution-version <version>',
      'Resolution generation to score',
      CURRENT_RESOLUTION_VERSION,
    )
    .option(
      '--qualification-version <version>',
      'Qualification generation whose qualified candidates are eligible',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--prescan-version <version>', 'Prescan generation to read', CURRENT_PRESCAN_VERSION)
    .option(
      '--scoring-version <version>',
      'Scoring configuration to apply',
      CURRENT_SCORING_VERSION,
    )
    .option('--limit <n>', 'Score at most this many hotels', parsePositiveInt)
    .option('--domain <registrable-domain>', 'Score only this hotel, by its own registrable domain')
    .option('--rescore-all', 'Score again where a score exists at this version', false)
    .option('--dry-run', 'Report the population that would be scored, writing nothing', false)
    .action(
      async (opts: {
        resolutionVersion: string;
        qualificationVersion: string;
        prescanVersion: string;
        scoringVersion: string;
        limit?: number;
        domain?: string;
        rescoreAll: boolean;
        dryRun: boolean;
      }) => {
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const report = await scoreHotels({
            store: createMongoHotelScoringStore(mongoConnection),
            resolutionVersion: opts.resolutionVersion,
            qualificationVersion: opts.qualificationVersion,
            prescanVersion: opts.prescanVersion,
            scoringVersion: opts.scoringVersion,
            ...(opts.limit === undefined ? {} : { limit: opts.limit }),
            ...(opts.domain === undefined ? {} : { domain: opts.domain }),
            rescoreAll: opts.rescoreAll,
            dryRun: opts.dryRun,
            // Progress on stderr, so stdout stays one parseable document.
            onProgress: (scored) => process.stderr.write(`scored ${scored}\r`),
          });
          console.log(JSON.stringify(report, null, 2));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect score run: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  scoreCommand
    .command('select')
    .description('Select the outreach cohort from the current scores. Contacts nobody.')
    .option(
      '--scoring-version <version>',
      'Scoring configuration to select on',
      CURRENT_SCORING_VERSION,
    )
    .option(
      '--qualification-version <version>',
      'Qualification generation a candidate must still hold',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--dry-run', 'Compute and print the cohort without recording it', false)
    .action(
      async (opts: { scoringVersion: string; qualificationVersion: string; dryRun: boolean }) => {
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const report = await selectCohort({
            store: createMongoCohortSelectionStore(mongoConnection),
            scoringVersion: opts.scoringVersion,
            qualificationVersion: opts.qualificationVersion,
            dryRun: opts.dryRun,
          });
          console.log(JSON.stringify(report, null, 2));
          if (!report.approved) {
            console.error(
              'odysseus prospect score select: this scoring configuration is not approved, so the ' +
                'cohort is calibration only and nothing is selected.',
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect score select: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  scoreCommand
    .command('report')
    .description('Print the score distribution, the latest cohort, and the market-wide aggregate.')
    .option(
      '--scoring-version <version>',
      'Scoring generation to summarize',
      CURRENT_SCORING_VERSION,
    )
    .option(
      '--prescan-version <version>',
      'Prescan generation to aggregate',
      CURRENT_PRESCAN_VERSION,
    )
    .option(
      '--minimum-group-size <n>',
      'Hide any fingerprint seen on fewer hotels than this',
      parsePositiveInt,
      5,
    )
    .action(
      async (opts: {
        scoringVersion: string;
        prescanVersion: string;
        minimumGroupSize: number;
      }) => {
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const [summary, cohort, aggregate] = await Promise.all([
            getHotelScoreSummary(mongoConnection, opts.scoringVersion),
            getLatestScoreCohort(mongoConnection, opts.scoringVersion),
            getPrescanVendorAggregate(mongoConnection, opts.prescanVersion, opts.minimumGroupSize),
          ]);
          console.log(
            JSON.stringify(
              {
                summary,
                cohort:
                  cohort === null
                    ? null
                    : {
                        cohortId: cohort.cohortId,
                        selectionRuleVersion: cohort.selectionRuleVersion,
                        approved: cohort.approved,
                        computedAt: cohort.computedAt,
                        populationSize: cohort.populationSize,
                        selectedCount: cohort.selectedCount,
                        abilityCutoff: cohort.abilityCutoff,
                        brokennessCutoff: cohort.brokennessCutoff,
                        notSelectedByReason: cohort.notSelectedByReason,
                      },
                // An operator signal about how this market builds its funnels
                // and where it fails, counted per hotel and hidden below the
                // group size. Not a vendor outreach list.
                marketAggregate: aggregate,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect score report: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  scoreCommand
    .command('diff')
    .description('Compare what two scoring versions say about the same hotels.')
    .requiredOption('--from-version <version>', 'Scoring generation to compare from')
    .requiredOption('--to-version <version>', 'Scoring generation to compare to')
    .action(async (opts: { fromVersion: string; toVersion: string }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const diff = await diffHotelScoreVersions(
          mongoConnection,
          opts.fromVersion,
          opts.toVersion,
        );
        console.log(JSON.stringify(diff, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect score diff: failed\n${message}`);
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

  // Milestone 9c plan 007. A group with a `run` child, for the reason
  // hotel-qualify's own comment gives: siblings sharing an option name silently
  // bind the parent's copy otherwise.
  //
  // Runs inline rather than through the job queue, like hotel-qualify and for
  // the same reason: this pass makes at most three plain HTTP requests per
  // site, and the politeness that matters here is the shared OriginLock and the
  // crawl delay, both constructed below. It launches no browser.
  const contacts = prospect
    .command('contacts')
    .description(
      'Milestone 9c: discover approved own-domain role contacts for the selected outreach cohort.',
    );

  contacts
    .command('run')
    .description('Read the selected cohort sites and keep at most one role address each.')
    .option('--contact-version <version>', 'Contact generation to write', CURRENT_CONTACT_VERSION)
    .option(
      '--scoring-version <version>',
      'Scoring version whose latest cohort is the population',
      CURRENT_SCORING_VERSION,
    )
    .option(
      '--qualification-version <version>',
      'Qualification generation whose stored mentions legales URL is reused',
      CURRENT_QUALIFICATION_VERSION,
    )
    .option('--limit <n>', 'Look at most at this many cohort members', parsePositiveInt)
    .option('--domain <registrable-domain>', 'Look at only this hotel, by its own domain')
    .option('--concurrency <n>', 'Hotels in flight at once', parsePositiveInt, 3)
    .option('--recontact', 'Look again where a contact exists at this version', false)
    .option('--dry-run', 'Report the population and the request budget, writing nothing', false)
    .action(
      async (opts: {
        contactVersion: string;
        scoringVersion: string;
        qualificationVersion: string;
        limit?: number;
        domain?: string;
        concurrency: number;
        recontact: boolean;
        dryRun: boolean;
      }) => {
        // The same bound the prescan command requires, for a weaker but real
        // version of the same reason: a cohort is already a small population,
        // but "small" is a property of today's catalogue rather than of this
        // command, and an unbounded batch against live third-party sites should
        // never be one forgotten flag away. A dry run makes no request at all
        // and needs no bound.
        if (!opts.dryRun && opts.limit === undefined && opts.domain === undefined) {
          console.error(
            'odysseus prospect contacts run: --limit or --domain is required, or --dry-run to ' +
              'plan without making a request.',
          );
          process.exitCode = 1;
          return;
        }

        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();

          // One lock for the whole run, shared across every lane, exactly as
          // hotel-qualify does: without it each lane looks individually polite
          // while one vendor host takes every lane's request at once.
          const originLock = new OriginLock();
          const fetchOptions = {
            crawlDelayMs: getCrawlDelayMs(),
            userAgent: getCrawlerUserAgent(),
            timeoutMs: DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
          };

          const report = await discoverContacts({
            store: createMongoHotelContactStore(mongoConnection, {
              scoringVersion: opts.scoringVersion,
              contactVersion: opts.contactVersion,
              qualificationVersion: opts.qualificationVersion,
              recontact: opts.recontact,
            }),
            fetchPages: (domain, knownMentionsLegalesUrl) =>
              fetchContactPages(domain, originLock, {
                ...fetchOptions,
                knownMentionsLegalesUrl,
              }),
            verifyMailDomain,
            contactVersion: opts.contactVersion,
            concurrency: opts.concurrency,
            dryRun: opts.dryRun,
            ...(opts.limit === undefined ? {} : { limit: opts.limit }),
            ...(opts.domain === undefined ? {} : { domain: opts.domain }),
            onProgress: (processed: number) => {
              // stderr, so stdout stays a single parseable JSON document.
              process.stderr.write(`contacted ${processed} cohort members\n`);
            },
          });

          console.log(JSON.stringify(report, null, 2));

          if (!report.reconciles) {
            console.error(
              'odysseus prospect contacts run: state counts do not reconcile with the number ' +
                'processed. Treat this report as unreliable rather than as a result.',
            );
            process.exitCode = 1;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect contacts run: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  contacts
    .command('report')
    .description('Print the outcome table for a contact version.')
    .option(
      '--contact-version <version>',
      'Contact generation to summarize',
      CURRENT_CONTACT_VERSION,
    )
    .option('--state <state>', 'found | parked | rejected | suppressed')
    .option('--limit <n>', 'Rows to print alongside the summary', parsePositiveInt, 25)
    .action(async (opts: { contactVersion: string; state?: string; limit: number }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const summary = await getHotelContactSummary(mongoConnection, opts.contactVersion);
        const rows = await listHotelContacts(mongoConnection, {
          contactVersion: opts.contactVersion,
          ...(opts.state === undefined ? {} : { state: opts.state as HotelContactState }),
          limit: opts.limit,
        });
        console.log(
          JSON.stringify(
            {
              summary,
              rows: rows.map((row) => ({
                domain: row.domain,
                state: row.state,
                reason: row.reason,
                address: row.address ?? null,
                source: row.source ?? null,
                mxStatus: row.mxStatus,
              })),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect contacts report: failed\n${message}`);
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
