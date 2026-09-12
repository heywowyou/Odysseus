import type { Command } from 'commander';
import {
  connectToMongo,
  disconnectFromMongo,
  diffHotelScoreVersions,
  getHotelScoreSummary,
  getLatestScoreCohort,
  getPrescanVendorAggregate,
} from '@odysseus/store';
import {
  CURRENT_PRESCAN_VERSION,
  CURRENT_QUALIFICATION_VERSION,
  CURRENT_RESOLUTION_VERSION,
  CURRENT_SCORING_VERSION,
  createMongoCohortSelectionStore,
  createMongoHotelScoringStore,
  scoreHotels,
  selectCohort,
} from '@odysseus/interface';
import { parsePositiveInt } from './shared.js';

/**
 * Milestone 9c plan 006: score prescanned hotels into immutable versioned
 * records, and select a cohort from them.
 *
 * A group with a `run` child rather than a flat action command, for the
 * reason hotel-qualify's own comment gives: siblings sharing an option name
 * silently bind the parent's copy otherwise.
 *
 * Every one of these runs inline. Scoring reads only what earlier passes
 * stored, so it contacts nobody, launches no browser, and has nothing to be
 * polite to - the queue's origin lock and crawl delay would bound a run that
 * makes no requests.
 */
export function registerScoreCommand(prospect: Command): void {
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
    .option(
      '--selection-rule-version <version>',
      'Brokenness band to select on (defaults to the decile rule)',
    )
    .option('--dry-run', 'Compute and print the cohort without recording it', false)
    .action(
      async (opts: {
        scoringVersion: string;
        qualificationVersion: string;
        selectionRuleVersion?: string;
        dryRun: boolean;
      }) => {
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const report = await selectCohort({
            store: createMongoCohortSelectionStore(mongoConnection),
            scoringVersion: opts.scoringVersion,
            qualificationVersion: opts.qualificationVersion,
            ...(opts.selectionRuleVersion === undefined
              ? {}
              : { selectionRuleVersion: opts.selectionRuleVersion }),
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
}
