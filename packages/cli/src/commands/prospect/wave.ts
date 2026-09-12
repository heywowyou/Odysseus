import type { Command } from 'commander';
import {
  addWaveRosterEntry,
  connectToMongo,
  disconnectFromMongo,
  listWaveRoster,
  revokeWaveRosterEntry,
} from '@odysseus/store';
import {
  CURRENT_SCORING_VERSION,
  scoreHotelOnDemandForConnection,
  type ScoreOnDemandOutcome,
} from '@odysseus/interface';
import { parsePositiveInt } from './shared.js';

/** Issue #199: one operator line per scoring outcome, so a hand-added
 *  hotel's missing score is stated here the same way the dashboard states
 *  it. Every skip is a normal situation (the hotel has not been scanned
 *  yet) except a store fault, which carries the fault's message. */
function printScoringOutcome(outcome: ScoreOnDemandOutcome, domain: string): void {
  if (outcome.outcome === 'scored') {
    console.log(`odysseus prospect wave add: scored ${domain}`);
    return;
  }
  if (outcome.outcome === 'already-scored') {
    console.log(`odysseus prospect wave add: ${domain} already holds a current score`);
    return;
  }
  if (outcome.reason === 'prescan-missing') {
    console.error(`odysseus prospect wave add: not scored (${domain}'s prescan is gone)`);
    return;
  }
  if (outcome.reason === 'error') {
    console.error(
      `odysseus prospect wave add: not scored (${outcome.errorMessage ?? 'scoring failed'})`,
    );
    return;
  }
  console.error(
    `odysseus prospect wave add: not scored (${domain} has no current prescan or qualification; ` +
      'run those passes first, then prospect score run --domain)',
  );
}

/**
 * Plan 041 slice B2: the operator's wave roster, a small hand-authored list
 * beside the selection rule's own cohort. Exists because a decision like
 * "work these four hotels the formula ranked just below the cut" has
 * nowhere else to live - recording it in a cohort would falsify the rule's
 * own output, so this is a second, additive authorization source the scan
 * gate reads next to cohort membership.
 */
export function registerWaveCommand(prospect: Command): void {
  const wave = prospect
    .command('wave')
    .description(
      'The operator wave roster: hotels authorized by hand for one outreach wave, ' +
        'beside the ones the selection rule picked.',
    );

  wave
    .command('add')
    .description('Add one hotel to a wave, authorizing an outreach scan for it.')
    .requiredOption('--wave <name>', 'Wave this decision belongs to, e.g. wave-1')
    .option('--candidate-id <id>', 'Hotel to add, by candidate id')
    .option('--domain <registrable-domain>', 'Hotel to add, by its own registrable domain')
    .option(
      '--rank <n>',
      "The selection rule's rank for this hotel, if it has one",
      parsePositiveInt,
    )
    .option(
      '--scoring-version <version>',
      'Scoring configuration the decision was taken against',
      CURRENT_SCORING_VERSION,
    )
    .requiredOption('--actor <name>', 'Who made this decision')
    .option('--note <text>', 'Free-text context for this decision')
    .action(
      async (opts: {
        wave: string;
        candidateId?: string;
        domain?: string;
        rank?: number;
        scoringVersion: string;
        actor: string;
        note?: string;
      }) => {
        if (opts.candidateId === undefined && opts.domain === undefined) {
          console.error('odysseus prospect wave add: pass --candidate-id or --domain');
          process.exitCode = 1;
          return;
        }
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const result = await addWaveRosterEntry(mongoConnection, {
            wave: opts.wave,
            ...(opts.candidateId === undefined ? {} : { candidateId: opts.candidateId }),
            ...(opts.domain === undefined ? {} : { domain: opts.domain }),
            ...(opts.rank === undefined ? {} : { rank: opts.rank }),
            scoringVersion: opts.scoringVersion,
            actor: opts.actor,
            ...(opts.note === undefined ? {} : { note: opts.note }),
          });
          if (!result.added) {
            console.error(`odysseus prospect wave add: refused (${result.refused})`);
            process.exitCode = 1;
            return;
          }
          console.log(
            `odysseus prospect wave add: added ${result.domain} (${result.candidateId}) to ${opts.wave}`,
          );
          printScoringOutcome(
            await scoreHotelOnDemandForConnection(mongoConnection, result.domain),
            result.domain,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect wave add: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  wave
    .command('remove')
    .description('Revoke one hotel from a wave. The entry is kept, marked revoked, never deleted.')
    .requiredOption('--wave <name>', 'Wave to remove the hotel from')
    .option('--candidate-id <id>', 'Hotel to remove, by candidate id')
    .option('--domain <registrable-domain>', 'Hotel to remove, by its own registrable domain')
    .requiredOption('--actor <name>', 'Who made this decision')
    .action(
      async (opts: { wave: string; candidateId?: string; domain?: string; actor: string }) => {
        if (opts.candidateId === undefined && opts.domain === undefined) {
          console.error('odysseus prospect wave remove: pass --candidate-id or --domain');
          process.exitCode = 1;
          return;
        }
        let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
        try {
          mongoConnection = await connectToMongo();
          const result = await revokeWaveRosterEntry(mongoConnection, {
            wave: opts.wave,
            ...(opts.candidateId === undefined ? {} : { candidateId: opts.candidateId }),
            ...(opts.domain === undefined ? {} : { domain: opts.domain }),
            actor: opts.actor,
          });
          if (!result.revoked) {
            console.error(`odysseus prospect wave remove: refused (${result.refused})`);
            process.exitCode = 1;
            return;
          }
          console.log(
            `odysseus prospect wave remove: revoked ${result.candidateId} from ${opts.wave}`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`odysseus prospect wave remove: failed\n${message}`);
          process.exitCode = 1;
        } finally {
          if (mongoConnection) await disconnectFromMongo(mongoConnection);
        }
      },
    );

  wave
    .command('list')
    .description("List a wave's roster entries, active only by default.")
    .option('--wave <name>', 'Wave to list; every wave when omitted')
    .option('--include-revoked', 'Also list revoked entries', false)
    .action(async (opts: { wave?: string; includeRevoked: boolean }) => {
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;
      try {
        mongoConnection = await connectToMongo();
        const rows = await listWaveRoster(mongoConnection, {
          ...(opts.wave === undefined ? {} : { wave: opts.wave }),
          includeRevoked: opts.includeRevoked,
        });
        console.log(JSON.stringify(rows, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus prospect wave list: failed\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
      }
    });
}
