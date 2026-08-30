/** Privacy-safe campaign counts for plans 013 and 014. */
import type { Connection } from 'mongoose';
import type { OutreachEvidenceSlot, OutreachOutcome } from '@odysseus/core';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';
import { createHotelScoreModel } from './schemas/score.schema.js';

export interface GetOutreachCampaignAggregateOptions {
  scoringVersion: string;
  cohortId?: string;
}

export interface OutreachCampaignAggregateRow {
  brokennessDecile: number;
  abilityHalf: 'lower' | 'upper';
  touch1EvidenceSlot: OutreachEvidenceSlot | 'unknown';
  outcome: OutreachOutcome | 'unrecorded';
  count: number;
}

export interface OutreachCampaignAggregate {
  scoringVersion: string;
  cohortId: string | null;
  rows: OutreachCampaignAggregateRow[];
}

function brokennessDecile(total: number): number {
  return Math.min(10, Math.floor(Math.max(0, total) / 10) + 1);
}

export async function getOutreachCampaignAggregate(
  connection: Connection,
  options: GetOutreachCampaignAggregateOptions,
): Promise<OutreachCampaignAggregate> {
  const CohortModel = createHotelScoreCohortModel(connection);
  const cohortQuery: Record<string, unknown> = { scoringVersion: options.scoringVersion };
  if (options.cohortId !== undefined) cohortQuery['cohortId'] = options.cohortId;
  const cohort = await CohortModel.findOne(cohortQuery).sort({ computedAt: -1 }).lean();
  if (cohort === null) {
    return { scoringVersion: options.scoringVersion, cohortId: null, rows: [] };
  }

  const scoreIds = cohort.members.map((member) => member.scoreId);
  const candidateIds = cohort.members.map((member) => member.candidateId);
  const [scores, threads, drafts] = await Promise.all([
    createHotelScoreModel(connection)
      .find({ scoreId: { $in: scoreIds } })
      .lean(),
    createOutreachThreadModel(connection)
      .find({ candidateId: { $in: candidateIds } })
      .lean(),
    createOutreachDraftModel(connection)
      .find({
        candidateId: { $in: candidateIds },
        touch: 1,
        status: { $in: ['created', 'deleted'] },
      })
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const scoresById = new Map(scores.map((score) => [score.scoreId, score]));
  const threadsByCandidate = new Map(threads.map((thread) => [thread.candidateId, thread]));
  const openerByCandidate = new Map<string, (typeof drafts)[number]>();
  for (const draft of drafts) {
    if (!openerByCandidate.has(draft.candidateId)) openerByCandidate.set(draft.candidateId, draft);
  }

  const outcomeIds = threads.flatMap((thread) =>
    thread.currentOutcome === undefined ? [] : [thread.currentOutcome],
  );
  const outcomes = await createOutreachOutcomeModel(connection)
    .find({ outcomeId: { $in: outcomeIds } })
    .lean();
  const outcomesById = new Map(outcomes.map((outcome) => [outcome.outcomeId, outcome]));

  const counts = new Map<string, OutreachCampaignAggregateRow>();
  for (const member of cohort.members) {
    const score = scoresById.get(member.scoreId);
    const thread = threadsByCandidate.get(member.candidateId);
    if (score === undefined || thread === undefined) continue;
    const opener = openerByCandidate.get(member.candidateId);
    const currentOutcome =
      thread.currentOutcome === undefined ? undefined : outcomesById.get(thread.currentOutcome);
    const row: OutreachCampaignAggregateRow = {
      brokennessDecile: brokennessDecile(score.brokenness.total),
      abilityHalf: score.ability.total >= 50 ? 'upper' : 'lower',
      touch1EvidenceSlot: opener?.touch1EvidenceSlot ?? 'unknown',
      outcome: currentOutcome?.outcome ?? 'unrecorded',
      count: 1,
    };
    const key = JSON.stringify([
      row.brokennessDecile,
      row.abilityHalf,
      row.touch1EvidenceSlot,
      row.outcome,
    ]);
    const existing = counts.get(key);
    if (existing === undefined) counts.set(key, row);
    else existing.count += 1;
  }

  const rows = [...counts.values()].sort((a, b) => {
    if (a.brokennessDecile !== b.brokennessDecile) {
      return a.brokennessDecile - b.brokennessDecile;
    }
    return JSON.stringify(a).localeCompare(JSON.stringify(b));
  });
  return { scoringVersion: options.scoringVersion, cohortId: cohort.cohortId, rows };
}
