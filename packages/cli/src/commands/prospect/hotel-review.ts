import type { Command } from 'commander';
import {
  connectToMongo,
  disconnectFromMongo,
  getHotelCandidateYield,
  listHotelCandidates,
  recordHotelCandidateReview,
} from '@odysseus/store';
import { CURRENT_RESOLUTION_VERSION } from '@odysseus/interface';
import { parsePositiveInt } from './shared.js';

/** Milestone 9c: inspect and decide the hotel candidates resolution could
 *  not merge on exact evidence. */
export function registerHotelReviewCommand(prospect: Command): void {
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
}
