/**
 * Score views: the latest score per candidate with its complete brokenness
 * and ability breakdowns, and the per-hotel diff between two scoring
 * versions.
 */

import type { Connection } from 'mongoose';
import type {
  HotelAbilityComponentId,
  HotelBrokennessComponentId,
  HotelScoreReason,
} from '@odysseus/core';
import { getLatestHotelScore } from '../scores.js';
import { createHotelScoreModel, type HotelScoreDocument } from '../schemas/score.schema.js';
import { candidateIdentityView, type OperatorCandidateIdentity } from './prescan-evidence.js';

export interface OperatorScoreComponentView {
  id: HotelBrokennessComponentId | HotelAbilityComponentId;
  points: number;
  reason: HotelScoreReason;
}

export interface OperatorScoreBreakdownView {
  total: number;
  components: OperatorScoreComponentView[];
}

export interface OperatorScoreView {
  scoreId: string;
  candidateId: string;
  name: string;
  commune: string | null;
  postcode: string | null;
  scoringVersion: string;
  prescanId: string;
  prescanVersion: string;
  computedAt: Date;
  worthy: boolean;
  evidenceComplete: boolean;
  brokenness: OperatorScoreBreakdownView;
  ability: OperatorScoreBreakdownView;
}

export interface GetProspectScoreViewOptions {
  /** Latest at this version when given; latest of any version otherwise. */
  scoringVersion?: string;
}

function projectScore(
  score: HotelScoreDocument,
  identity: OperatorCandidateIdentity,
): OperatorScoreView {
  const projectComponents = (breakdown: {
    total: number;
    components: {
      id: HotelBrokennessComponentId | HotelAbilityComponentId;
      points: number;
      reason: HotelScoreReason;
    }[];
  }): OperatorScoreBreakdownView => ({
    total: breakdown.total,
    components: breakdown.components.map((component) => ({
      id: component.id,
      points: component.points,
      reason: component.reason,
    })),
  });
  return {
    scoreId: score.scoreId,
    candidateId: score.candidateId,
    ...identity,
    scoringVersion: score.scoringVersion,
    prescanId: score.prescanId,
    prescanVersion: score.prescanVersion,
    computedAt: score.computedAt,
    worthy: score.worthy,
    evidenceComplete: score.evidenceComplete,
    brokenness: projectComponents(score.brokenness),
    ability: projectComponents(score.ability),
  };
}

/** The latest score with its complete breakdown. Scores are insert-only, so
 *  "latest" is the newest computation, not a mutable current value. */
export async function getProspectScoreView(
  connection: Connection,
  candidateId: string,
  options: GetProspectScoreViewOptions = {},
): Promise<OperatorScoreView | null> {
  const score =
    options.scoringVersion !== undefined
      ? await getLatestHotelScore(connection, candidateId, options.scoringVersion)
      : await createHotelScoreModel(connection)
          .findOne({ candidateId })
          .sort({ computedAt: -1, scoreId: 1 })
          .lean<HotelScoreDocument>();
  if (score === null) return null;
  const identity = await candidateIdentityView(connection, candidateId);
  return projectScore(score, identity);
}

export interface OperatorScoreDiffView {
  candidateId: string;
  fromVersion: string;
  toVersion: string;
  from: OperatorScoreView | null;
  to: OperatorScoreView | null;
  /** Null when either side is missing: an absent score is not a zero. */
  brokennessDelta: number | null;
  abilityDelta: number | null;
}

/** What two scoring versions say about one hotel, with full breakdowns on
 *  both sides. diffHotelScoreVersions answers the same question for a whole
 *  population and totals only; the per-hotel why needs the components. */
export async function getProspectScoreDiffView(
  connection: Connection,
  candidateId: string,
  fromVersion: string,
  toVersion: string,
): Promise<OperatorScoreDiffView> {
  const [from, to] = await Promise.all([
    getProspectScoreView(connection, candidateId, { scoringVersion: fromVersion }),
    getProspectScoreView(connection, candidateId, { scoringVersion: toVersion }),
  ]);
  return {
    candidateId,
    fromVersion,
    toVersion,
    from,
    to,
    brokennessDelta:
      from === null || to === null ? null : to.brokenness.total - from.brokenness.total,
    abilityDelta: from === null || to === null ? null : to.ability.total - from.ability.total,
  };
}
