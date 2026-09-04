import type { Command } from 'commander';
import {
  connectToMongo,
  disconnectFromMongo,
  getHotelCandidateYield,
  getHotelQualificationYield,
  getLatestHotelQualificationVersion,
  listHotelQualifications,
} from '@odysseus/store';
import { OriginLock, getCrawlDelayMs, getCrawlerUserAgent } from '@odysseus/scanner';
import { decideOverpassNeed, type HotelQualificationOutcome } from '@odysseus/core';
import {
  CURRENT_QUALIFICATION_VERSION,
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  checkHotelSite,
  createHotelSireneJoiner,
  createMongoHotelQualificationStore,
  createMongoReconcileRedirectsStore,
  createMongoBackfillSireneStore,
  backfillSirene,
  qualifyHotels,
  reconcileRedirects,
  getSireneStockIndexCachePath,
  getSireneStockPath,
  CURRENT_RESOLUTION_VERSION,
} from '@odysseus/interface';
import { parsePositiveInt } from './shared.js';

/**
 * Milestone 9c: qualify campaign-ready hotel candidates with bounded DNS,
 * TLS, and HTTP checks. No browser, no recipient contact. Runs inline.
 *
 * A group with a `run` subcommand rather than an action command that also
 * has subcommands. The flat shape was tried and was quietly wrong: the
 * parent and `report`/`reasons` both need --qualification-version, Commander
 * binds the parent's copy, and the subcommand silently falls back to its
 * default. That failed as an empty result list, not an error, which is the
 * worst way for a reporting command to be wrong. Same shape as hotel-review,
 * for the same reason.
 */
export function registerHotelQualifyCommand(prospect: Command): void {
  const qualify = prospect
    .command('hotel-qualify')
    .description(
      'Milestone 9c: qualify campaign-ready hotel candidates with bounded DNS, TLS, and HTTP ' +
        'checks. No browser, no recipient contact. Runs inline.',
    );

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
      'Qualification generation to summarize (defaults to the newest persisted generation)',
    )
    .option(
      '--resolution-version <version>',
      'Resolution generation to summarize alongside it',
      CURRENT_RESOLUTION_VERSION,
    )
    .action(async (opts: { qualificationVersion?: string; resolutionVersion: string }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const qualificationVersion =
          opts.qualificationVersion ??
          (await getLatestHotelQualificationVersion(mongoConnection)) ??
          CURRENT_QUALIFICATION_VERSION;
        if (
          opts.qualificationVersion === undefined &&
          qualificationVersion !== CURRENT_QUALIFICATION_VERSION
        ) {
          console.error(
            `odysseus prospect hotel-qualify report: no --qualification-version supplied; ` +
              `using newest persisted generation '${qualificationVersion}'.`,
          );
        }
        const qualification = await getHotelQualificationYield(
          mongoConnection,
          qualificationVersion,
        );
        const catalogue = await getHotelCandidateYield(mongoConnection, opts.resolutionVersion);
        console.log(
          JSON.stringify(
            {
              resolutionVersion: opts.resolutionVersion,
              qualificationVersion,
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
      'Qualification generation to read (defaults to the newest persisted generation)',
    )
    .option('--outcome <outcome>', 'qualified | parked | rejected | already-engaged | group-routed')
    .option('--limit <n>', 'Maximum rows to print', parsePositiveInt, 50)
    .action(async (opts: { qualificationVersion?: string; outcome?: string; limit: number }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const qualificationVersion =
          opts.qualificationVersion ??
          (await getLatestHotelQualificationVersion(mongoConnection)) ??
          CURRENT_QUALIFICATION_VERSION;
        if (
          opts.qualificationVersion === undefined &&
          qualificationVersion !== CURRENT_QUALIFICATION_VERSION
        ) {
          console.error(
            `odysseus prospect hotel-qualify reasons: no --qualification-version supplied; ` +
              `using newest persisted generation '${qualificationVersion}'.`,
          );
        }
        const rows = await listHotelQualifications(
          mongoConnection,
          {
            qualificationVersion,
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
}
