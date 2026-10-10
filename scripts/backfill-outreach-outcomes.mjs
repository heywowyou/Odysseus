#!/usr/bin/env node

/**
 * An outcome the operator recorded used to change the prospect's status and
 * write a prospect event, but never the outcome row of its outreach thread,
 * so the campaign funnel counted no outcome at all. Recording now writes
 * both. This script repairs the threads that were recorded before: each
 * thread with no outcome takes its prospect's latest recorded outcome event
 * still stored. A thread that already has an outcome is never touched.
 *
 * usage (inside odysseus-app-1):
 *
 *   node /app/scripts/backfill-outreach-outcomes.mjs            # dry run
 *   node /app/scripts/backfill-outreach-outcomes.mjs --apply
 *
 * Dry run is the default. Both modes print counts only.
 */

// The container's built packages, loaded dynamically: this path exists only
// inside the production image, so a static import would not resolve here.
const { backfillOutreachThreadOutcomes, connectToMongo, disconnectFromMongo } =
  await import('/app/packages/store/dist/index.js');

const apply = process.argv.slice(2).includes('--apply');
const connection = await connectToMongo();
try {
  const result = await backfillOutreachThreadOutcomes(connection, { apply });
  console.log(`threads without an outcome      ${result.threadsWithoutOutcome}`);
  console.log(`  with a recorded outcome event ${result.recoverable}`);
  console.log(
    apply
      ? `  outcome rows written          ${result.written}`
      : '  dry run: nothing written. Pass --apply to write.',
  );
} finally {
  await disconnectFromMongo(connection);
}
