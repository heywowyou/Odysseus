import type { Command } from 'commander';
import {
  connectToMongo,
  createJob,
  disconnectFromMongo,
  getPrescanSummary,
  listCandidatesToPrescan,
} from '@odysseus/store';
import { getPrescansRoot, sweepExpiredPrescanArtifacts } from '@odysseus/scanner';
import {
  CURRENT_PRESCAN_VERSION,
  CURRENT_QUALIFICATION_VERSION,
  CURRENT_RESOLUTION_VERSION,
} from '@odysseus/interface';
import { DRY_RUN_PLAN_CEILING, parsePositiveInt } from './shared.js';

/**
 * Milestone 9c: prescan qualified hotels with a bounded three-page browser
 * pass. No Lighthouse, no paid-audit records.
 *
 * Enqueued rather than run inline, unlike hotel-qualify. This is the
 * distinction prospect.ts's own header draws: hotel-qualify makes plain
 * bounded HTTP requests, while a prescan drives Chromium against live
 * third-party sites, which is exactly the work the queue's concurrency
 * ceiling, its per-origin lock, and its politeness budget exist to bound. A
 * dry run is the exception below, because it contacts nobody.
 */
export function registerPrescanCommand(prospect: Command): void {
  const prescan = prospect
    .command('prescan')
    .description(
      'Milestone 9c: prescan qualified hotels with a bounded three-page browser pass. ' +
        'No Lighthouse, no paid-audit records.',
    );

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
}
