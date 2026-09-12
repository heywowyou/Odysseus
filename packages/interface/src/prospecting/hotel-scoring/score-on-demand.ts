/**
 * Scores one named hotel on demand, so a hotel the operator adds to a wave
 * by hand shows its Problems found / Ability to fix numbers like any cohort
 * member (issue #199). The batch pass (score-hotels.ts) only runs when the
 * operator invokes the CLI, which left a roster-added hotel permanently
 * unscored; the add actions run this instead, the same pass bounded to one
 * hotel.
 *
 * Scoring contacts nobody: every fact it reads was stored by an earlier
 * pass, the same rule score-hotels.ts states for the batch. A hotel
 * outside the scoring population (no current prescan, or its qualification
 * or campaign eligibility is not current) is a normal outcome here,
 * reported as a typed skip rather than an error, because a hand-added
 * hotel often has not been scanned yet.
 */

import type { Connection } from 'mongoose';
import { CURRENT_SCORING_VERSION } from '@odysseus/core';
import { CURRENT_RESOLUTION_VERSION } from '../hotel-identity/resolve-hotels.js';
import { CURRENT_QUALIFICATION_VERSION } from '../hotel-qualification/qualify-hotels.js';
import { CURRENT_PRESCAN_VERSION } from '../hotel-prescan/prescan-hotels.js';
import { createMongoHotelScoringStore } from './mongo-hotel-score-store.js';
import { scoreHotels, type HotelScoringStorePort, type ScoreHotelsReport } from './score-hotels.js';

export type ScoreOnDemandOutcome =
  | { outcome: 'scored' }
  | { outcome: 'already-scored' }
  | {
      outcome: 'skipped';
      reason: 'not-in-scoring-population' | 'prescan-missing' | 'prescan-incomplete' | 'error';
      /** The store fault's message when the reason is 'error'. */
      errorMessage?: string;
    };

export interface ScoreOnDemandVersions {
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  scoringVersion: string;
}

/** Maps one bounded scoring run onto the three outcomes the wave add
 *  actions can state. The store fault becomes a typed skip too: the roster
 *  write has already succeeded, so the add must not fail because its
 *  follow-up could not score. */
export async function scoreHotelOnDemand(
  store: HotelScoringStorePort,
  domain: string,
  versions: ScoreOnDemandVersions,
): Promise<ScoreOnDemandOutcome> {
  let report: ScoreHotelsReport;
  try {
    report = await scoreHotels({
      store,
      ...versions,
      domain,
      limit: 1,
      rescoreAll: false,
      dryRun: false,
    });
  } catch (error) {
    return {
      outcome: 'skipped',
      reason: 'error',
      ...(error instanceof Error && error.message !== '' ? { errorMessage: error.message } : {}),
    };
  }
  if (report.scored > 0) return { outcome: 'scored' };
  if (report.skipped['already-scored'] > 0) return { outcome: 'already-scored' };
  if (report.skipped['prescan-missing'] > 0) {
    return { outcome: 'skipped', reason: 'prescan-missing' };
  }
  // Issue #202: the prescan exists but did not reach 'complete' - blocked
  // by robots, an unreachable homepage, or a redirect interstitial that
  // never resolved. Distinct from 'not-in-scoring-population', which means
  // the hotel itself is not eligible; this means the measurement is.
  if (report.skipped['prescan-incomplete'] > 0) {
    return { outcome: 'skipped', reason: 'prescan-incomplete' };
  }
  return { outcome: 'skipped', reason: 'not-in-scoring-population' };
}

/** The connection-shaped entry point the wave add actions (the dashboard
 *  route and the CLI) call after a successful roster write. */
export async function scoreHotelOnDemandForConnection(
  connection: Connection,
  domain: string,
): Promise<ScoreOnDemandOutcome> {
  return scoreHotelOnDemand(createMongoHotelScoringStore(connection), domain, {
    resolutionVersion: CURRENT_RESOLUTION_VERSION,
    qualificationVersion: CURRENT_QUALIFICATION_VERSION,
    prescanVersion: CURRENT_PRESCAN_VERSION,
    scoringVersion: CURRENT_SCORING_VERSION,
  });
}
