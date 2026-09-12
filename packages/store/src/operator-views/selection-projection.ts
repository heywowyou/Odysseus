/**
 * Which hotels the operator can work, projected for the lists (plan 041
 * slice B1).
 *
 * This is a read-only projection of what planOutreachFullScan already reads,
 * never a second authorization. Membership here means "a record puts this
 * hotel in the current wave"; a member can still be refused at scan time
 * because its qualification is stale, its domain changed hands, it opted
 * out, or a scan is already running. The hub shows the gate's own typed
 * verdict for that; this answers the list's question, which is "which rows
 * are even in play".
 *
 * It mirrors the gate per candidate rather than taking a shortcut over the
 * newest cohort: a hotel selected in an approved earlier cohort stays in
 * play when a later cohort omits it, and a hotel selected only in a cohort
 * nobody approved is not in play. The wave roster is the operator's own
 * additive list, so a roster entry puts a hotel in play whatever the
 * cohorts say.
 */

import type { Connection } from 'mongoose';
import { createHotelScoreCohortModel } from '../schemas/score-cohort.schema.js';
import { createWaveRosterEntryModel } from '../schemas/wave-roster.schema.js';
import type { WaveRosterEntryDocument } from '../schemas/wave-roster.schema.js';

export type SelectionSource = 'cohort' | 'wave-roster';

export interface SelectionMember {
  candidateId: string;
  source: SelectionSource;
  /** The rank the authorizing record gives, when it gives one. */
  rank: number | null;
}

/** The newest approved cohort's own facts, which are what the list's
 *  explanatory copy quotes: how large the population was, and where the
 *  cutoffs fell. Null when no cohort has ever been approved. */
export interface SelectionCohortFacts {
  cohortId: string;
  scoringVersion: string;
  computedAt: Date;
  populationSize: number;
  selectedCount: number;
  abilityCutoff: number | null;
  brokennessCutoff: number | null;
}

export interface SelectionProjection {
  /** Every hotel in play, by candidate id. */
  members: Map<string, SelectionMember>;
  cohort: SelectionCohortFacts | null;
  /** How many hotels the roster adds beyond cohort membership, so the list
   *  can say that the two sources differ rather than hiding it in a total. */
  rosterOnlyCount: number;
}

interface CohortProjectionRow {
  cohortId: string;
  scoringVersion: string;
  approved: boolean;
  computedAt: Date;
  populationSize: number;
  selectedCount: number;
  abilityCutoff: number | null;
  brokennessCutoff: number | null;
  members: { candidateId: string; rank: number; state: string }[];
}

export interface SelectionVerdict {
  inSelection: boolean;
  source: SelectionSource | null;
  rank: number | null;
  cohort: SelectionCohortFacts | null;
}

/** The hub's single-candidate question, built from the same projection the
 *  list uses so the two surfaces can never disagree about who is in play.
 *  Reads the same handful of cohort and roster documents a list request
 *  does; not worth a second, narrower query for one candidate. */
export async function getSelectionVerdict(
  connection: Connection,
  candidateId: string,
): Promise<SelectionVerdict> {
  const projection = await getSelectionProjection(connection);
  const member = projection.members.get(candidateId);
  return {
    inSelection: member !== undefined,
    source: member?.source ?? null,
    rank: member?.rank ?? null,
    cohort: projection.cohort,
  };
}

/**
 * One read per request. The cohort collection holds one document per
 * selection run (a handful, and TTL-bounded), each carrying only its
 * selected and calibration rows rather than the whole catalogue, so reading
 * them all is bounded by how often the operator has run a selection and not
 * by how many hotels exist.
 */
export async function getSelectionProjection(connection: Connection): Promise<SelectionProjection> {
  const [cohorts, rosterEntries] = await Promise.all([
    createHotelScoreCohortModel(connection)
      .find({})
      .sort({ computedAt: -1 })
      .select({
        _id: 0,
        cohortId: 1,
        scoringVersion: 1,
        approved: 1,
        computedAt: 1,
        populationSize: 1,
        selectedCount: 1,
        abilityCutoff: 1,
        brokennessCutoff: 1,
        members: 1,
      })
      .lean<CohortProjectionRow[]>(),
    createWaveRosterEntryModel(connection)
      .find({ state: 'active' })
      .sort({ decidedAt: -1 })
      .select({ _id: 0, candidateId: 1, rank: 1 })
      .lean<Pick<WaveRosterEntryDocument, 'candidateId' | 'rank'>[]>(),
  ]);

  // Newest first, so the first cohort naming a candidate as selected is the
  // one the gate would read for it. Whether that cohort is approved is then
  // the whole answer for that candidate, exactly as in the gate.
  const members = new Map<string, SelectionMember>();
  const decided = new Set<string>();
  for (const cohort of cohorts) {
    for (const member of cohort.members) {
      if (member.state !== 'selected') continue;
      if (decided.has(member.candidateId)) continue;
      decided.add(member.candidateId);
      if (!cohort.approved) continue;
      members.set(member.candidateId, {
        candidateId: member.candidateId,
        source: 'cohort',
        rank: member.rank,
      });
    }
  }

  let rosterOnlyCount = 0;
  for (const entry of rosterEntries) {
    if (members.has(entry.candidateId)) continue;
    rosterOnlyCount += 1;
    members.set(entry.candidateId, {
      candidateId: entry.candidateId,
      source: 'wave-roster',
      rank: entry.rank,
    });
  }

  const newestApproved = cohorts.find((cohort) => cohort.approved);
  return {
    members,
    cohort:
      newestApproved === undefined
        ? null
        : {
            cohortId: newestApproved.cohortId,
            scoringVersion: newestApproved.scoringVersion,
            computedAt: newestApproved.computedAt,
            populationSize: newestApproved.populationSize,
            selectedCount: newestApproved.selectedCount,
            abilityCutoff: newestApproved.abilityCutoff,
            brokennessCutoff: newestApproved.brokennessCutoff,
          },
    rosterOnlyCount,
  };
}
