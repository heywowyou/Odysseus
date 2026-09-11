/**
 * Read/write helpers around the `hotel_scores` and `hotel_score_cohorts`
 * collections, milestone 9c plan 006. Callers never issue their own operations
 * against either, for the reason `prescans.ts` gives about its own: the
 * retention window and the insert-only rule live here, and a caller writing
 * directly would have to reimplement both.
 *
 * Unlike a qualification or a prescan, a score writes **no pointer onto the
 * candidate**. A candidate carries a pointer to its latest qualification and
 * its latest prescan because selecting what to do next is one indexed query
 * over the catalogue. Selection here is the opposite shape: a decile is a
 * property of the whole scored set, so the query that matters reads scores,
 * not candidates, and a denormalized `latestScore` would be a second source of
 * truth for a number that is only ever meaningful alongside its peers.
 */

import { randomUUID } from 'node:crypto';
import type { Connection } from 'mongoose';
import type { HotelOutreachScore, OutreachSelection } from '@odysseus/core';
import { createHotelScoreModel, type HotelScoreDocument } from './schemas/score.schema.js';
import {
  createHotelScoreCohortModel,
  type HotelScoreCohortDocument,
  type HotelScoreCohortMember,
} from './schemas/score-cohort.schema.js';
import {
  createHotelCandidateModel,
  type HotelCandidateDocument,
} from './schemas/hotel-candidate.schema.js';

const SCORE_RETENTION_DAYS = 90;

function expiryFrom(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SCORE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export interface RecordHotelScoreInput {
  candidateId: string;
  prescanId: string;
  domain: string;
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  score: HotelOutreachScore;
  evidenceComplete: boolean;
  computedAt: Date;
}

export interface RecordHotelScoresResult {
  inserted: number;
  scoreIds: string[];
}

/** Insert-only. A rescore of the same prescan under the same version is a new
 *  document, which is what makes a diff between two runs possible at all. */
export async function recordHotelScores(
  connection: Connection,
  inputs: readonly RecordHotelScoreInput[],
): Promise<RecordHotelScoresResult> {
  if (inputs.length === 0) return { inserted: 0, scoreIds: [] };
  const ScoreModel = createHotelScoreModel(connection);
  await ScoreModel.init();

  const createdAt = new Date();
  const documents: HotelScoreDocument[] = inputs.map((input) => ({
    scoreId: randomUUID(),
    candidateId: input.candidateId,
    prescanId: input.prescanId,
    domain: input.domain,
    resolutionVersion: input.resolutionVersion,
    qualificationVersion: input.qualificationVersion,
    prescanVersion: input.prescanVersion,
    scoringVersion: input.score.scoringVersion,
    brokenness: input.score.brokenness,
    ability: input.score.ability,
    worthy: input.score.worthy,
    evidenceComplete: input.evidenceComplete,
    computedAt: input.computedAt,
    createdAt,
    expiresAt: expiryFrom(createdAt),
  }));

  await ScoreModel.insertMany(documents);
  return { inserted: documents.length, scoreIds: documents.map((document) => document.scoreId) };
}

export async function getLatestHotelScore(
  connection: Connection,
  candidateId: string,
  scoringVersion: string,
): Promise<HotelScoreDocument | null> {
  return createHotelScoreModel(connection)
    .findOne({ candidateId, scoringVersion })
    .sort({ computedAt: -1 })
    .lean<HotelScoreDocument>();
}

/**
 * The latest score per candidate at one version, which is what selection ranks.
 * Grouping in the database rather than in the caller, because a rescored
 * population holds several documents per candidate and reading them all back to
 * discard most of them is the shape that stops working at catalogue scale.
 */
export async function listLatestHotelScores(
  connection: Connection,
  scoringVersion: string,
): Promise<HotelScoreDocument[]> {
  return createHotelScoreModel(connection).aggregate<HotelScoreDocument>([
    { $match: { scoringVersion } },
    { $sort: { candidateId: 1, computedAt: -1 } },
    { $group: { _id: '$candidateId', latest: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$latest' } },
    { $sort: { candidateId: 1 } },
  ]);
}

export interface ListCandidatesToScoreOptions {
  resolutionVersion: string;
  qualificationVersion: string;
  prescanVersion: string;
  limit: number;
  after?: string;
  /** One named hotel, when a run is checking a single site's breakdown. */
  domain?: string;
}

/**
 * The qualified, campaign-eligible candidates of one resolution run that
 * already carry a prescan at the requested version.
 *
 * The campaign gates are re-stated here rather than left implicit in the
 * qualification outcome, for the reason `listCandidatesToPrescan` gives: a
 * reader of this query should be able to see who can be scored without knowing
 * that another package's decision function enforces it.
 */
export async function listCandidatesToScore(
  connection: Connection,
  options: ListCandidatesToScoreOptions,
): Promise<HotelCandidateDocument[]> {
  const filter: Record<string, unknown> = {
    resolutionVersion: options.resolutionVersion,
    'qualification.outcome': 'qualified',
    'qualification.qualificationVersion': options.qualificationVersion,
    campaignEligibility: 'eligible',
    'prescan.prescanVersion': options.prescanVersion,
  };
  if (options.domain !== undefined) filter['ownRegistrableDomain'] = options.domain;
  if (options.after !== undefined) filter['candidateId'] = { $gt: options.after };

  return createHotelCandidateModel(connection)
    .find(filter)
    .sort({ candidateId: 1 })
    .limit(options.limit)
    .lean<HotelCandidateDocument[]>();
}

/** Candidate ids already holding a score at this version, so a resumed run does
 *  not rescore what it already scored. `--rescore-all` is what deliberately
 *  overrides this, the same shape `--rescan` has on the prescan. */
export async function findScoredCandidateIds(
  connection: Connection,
  scoringVersion: string,
  candidateIds: readonly string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await createHotelScoreModel(connection)
    .find({ scoringVersion, candidateId: { $in: [...candidateIds] } })
    .select({ candidateId: 1 })
    .lean<{ candidateId: string }[]>();
  return new Set(rows.map((row) => row.candidateId));
}

export interface HotelScoreSummary {
  scoringVersion: string;
  total: number;
  worthy: number;
  /** Counts by ten-point band, keyed '0-9' through '100'. Bands rather than a
   *  mean, because the question a run asks is where the population sits, and a
   *  mean of two very different distributions looks identical. */
  brokennessBands: Record<string, number>;
  abilityBands: Record<string, number>;
}

function bandLabel(total: number): string {
  if (total >= 100) return '100';
  const floor = Math.floor(total / 10) * 10;
  return `${floor}-${floor + 9}`;
}

export async function getHotelScoreSummary(
  connection: Connection,
  scoringVersion: string,
): Promise<HotelScoreSummary> {
  const rows = await listLatestHotelScores(connection, scoringVersion);
  const brokennessBands: Record<string, number> = {};
  const abilityBands: Record<string, number> = {};
  let worthy = 0;
  for (const row of rows) {
    if (row.worthy) worthy += 1;
    const brokenness = bandLabel(row.brokenness.total);
    const ability = bandLabel(row.ability.total);
    brokennessBands[brokenness] = (brokennessBands[brokenness] ?? 0) + 1;
    abilityBands[ability] = (abilityBands[ability] ?? 0) + 1;
  }
  return { scoringVersion, total: rows.length, worthy, brokennessBands, abilityBands };
}

export interface HotelScoreDiffRow {
  candidateId: string;
  domain: string;
  fromBrokenness: number | null;
  toBrokenness: number | null;
  fromAbility: number | null;
  toAbility: number | null;
}

export interface HotelScoreDiff {
  fromVersion: string;
  toVersion: string;
  onlyInFrom: number;
  onlyInTo: number;
  changed: HotelScoreDiffRow[];
  unchanged: number;
}

/** What two scoring versions say about the same hotels. The point of versioned
 *  weights is that this comparison is possible; without it a weight change is
 *  an unmeasured opinion. */
export async function diffHotelScoreVersions(
  connection: Connection,
  fromVersion: string,
  toVersion: string,
): Promise<HotelScoreDiff> {
  const [fromRows, toRows] = await Promise.all([
    listLatestHotelScores(connection, fromVersion),
    listLatestHotelScores(connection, toVersion),
  ]);
  const fromById = new Map(fromRows.map((row) => [row.candidateId, row]));
  const toById = new Map(toRows.map((row) => [row.candidateId, row]));

  const changed: HotelScoreDiffRow[] = [];
  let unchanged = 0;
  let onlyInFrom = 0;
  for (const [candidateId, from] of fromById) {
    const to = toById.get(candidateId);
    if (to === undefined) {
      onlyInFrom += 1;
      continue;
    }
    if (from.brokenness.total === to.brokenness.total && from.ability.total === to.ability.total) {
      unchanged += 1;
      continue;
    }
    changed.push({
      candidateId,
      domain: to.domain,
      fromBrokenness: from.brokenness.total,
      toBrokenness: to.brokenness.total,
      fromAbility: from.ability.total,
      toAbility: to.ability.total,
    });
  }
  let onlyInTo = 0;
  for (const candidateId of toById.keys()) if (!fromById.has(candidateId)) onlyInTo += 1;

  changed.sort((a, b) => (a.candidateId < b.candidateId ? -1 : 1));
  return { fromVersion, toVersion, onlyInFrom, onlyInTo, changed, unchanged };
}

export interface RecordScoreCohortResult {
  cohortId: string;
}

/** Insert-only, like a score. A cohort records what was decided at one moment
 *  over one population; recomputing it later is a new cohort, not a correction
 *  of the old one. */
export async function recordScoreCohort(
  connection: Connection,
  selection: OutreachSelection,
  computedAt: Date = new Date(),
): Promise<RecordScoreCohortResult> {
  const CohortModel = createHotelScoreCohortModel(connection);
  await CohortModel.init();

  const members: HotelScoreCohortMember[] = selection.records
    .filter((record) => record.state !== 'not-selected' && record.rank !== undefined)
    .map((record) => ({
      candidateId: record.candidateId,
      scoreId: record.scoreId,
      rank: record.rank as number,
      state: record.state,
      reason: record.reason,
    }));

  const notSelectedByReason: Record<string, number> = {};
  for (const record of selection.records) {
    if (record.state !== 'not-selected') continue;
    notSelectedByReason[record.reason] = (notSelectedByReason[record.reason] ?? 0) + 1;
  }

  const createdAt = new Date();
  const cohortId = randomUUID();
  await CohortModel.create({
    cohortId,
    scoringVersion: selection.scoringVersion,
    selectionRuleVersion: selection.selectionRuleVersion,
    approved: selection.approved,
    populationSize: selection.populationSize,
    abilityCutoff: selection.abilityCutoff,
    brokennessCutoff: selection.brokennessCutoff,
    selectedCount: selection.selectedCount,
    members,
    notSelectedByReason,
    computedAt,
    createdAt,
    expiresAt: expiryFrom(createdAt),
  });
  return { cohortId };
}

export async function getLatestScoreCohort(
  connection: Connection,
  scoringVersion: string,
): Promise<HotelScoreCohortDocument | null> {
  return createHotelScoreCohortModel(connection)
    .findOne({ scoringVersion })
    .sort({ computedAt: -1 })
    .lean<HotelScoreCohortDocument>();
}
