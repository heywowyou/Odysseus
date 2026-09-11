import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getOutreachCampaignAggregate } from './outreach-campaign-aggregate.js';
import { recordOutreachDraft } from './outreach-drafts.js';
import { recordOutreachOutcome } from './outreach-outcomes.js';
import { openOutreachThread } from './outreach-threads.js';
import { recordHotelScores, recordScoreCohort } from './scores.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';
import { createHotelScoreModel } from './schemas/score.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

const NOW = new Date('2026-08-30T09:00:00.000Z');
const SCORING_VERSION = 'hotel-outreach-v1';

describe.skipIf(!mongoAvailable)('outreach campaign aggregate', () => {
  beforeEach(async () => {
    if (!connection) return;
    await Promise.all([
      createOutreachDraftModel(connection).deleteMany({}),
      createOutreachOutcomeModel(connection).deleteMany({}),
      createOutreachThreadModel(connection).deleteMany({}),
      createHotelScoreCohortModel(connection).deleteMany({}),
      createHotelScoreModel(connection).deleteMany({}),
    ]);
  });

  it('returns count-only score, evidence and outcome groups with no recipient data', async () => {
    if (!connection) return;
    const candidateId = randomUUID();
    const scores = await recordHotelScores(connection, [
      {
        candidateId,
        prescanId: randomUUID(),
        domain: 'hotel-secret.fr',
        resolutionVersion: 'v1',
        qualificationVersion: 'v3',
        prescanVersion: 'v3',
        score: {
          scoringVersion: SCORING_VERSION,
          brokenness: { total: 88, components: [] },
          ability: { total: 67, components: [] },
          worthy: true,
        },
        evidenceComplete: true,
        computedAt: NOW,
      },
    ]);
    const scoreId = scores.scoreIds[0] as string;
    const { cohortId } = await recordScoreCohort(
      connection,
      {
        selectionRuleVersion: 'half-ability-decile-brokenness-v1',
        scoringVersion: SCORING_VERSION,
        approved: true,
        populationSize: 1,
        abilityCutoff: 67,
        brokennessCutoff: 88,
        selectedCount: 1,
        records: [
          {
            candidateId,
            scoreId,
            state: 'selected',
            reason: 'top-brokenness-decile',
            rank: 1,
          },
        ],
      },
      NOW,
    );
    const { thread } = await openOutreachThread(connection, {
      candidateId,
      prescanId: randomUUID(),
      previewId: randomUUID(),
      domain: 'hotel-secret.fr',
      roleAddress: 'direction@hotel-secret.fr',
      language: 'fr',
      openedAt: NOW,
      spacing: { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 },
    });
    await recordOutreachDraft(connection, {
      threadId: thread.threadId,
      candidateId,
      touch: 1,
      language: 'fr',
      roleAddress: 'direction@hotel-secret.fr',
      subject: 'Sujet confidentiel',
      body: 'Corps confidentiel qui ne doit jamais sortir.',
      htmlBody: '<div>Corps confidentiel.</div>',
      touch1EvidenceSlot: 'specific-failure',
      previewId: randomUUID(),
      previewUrl: 'https://www.odysseusaudit.com/apercu/secret',
      prescanVersion: 'v3',
      evidenceVersion: 'v2',
      outreachPromptVersion: 'v1',
      providerDraftId: 'provider-draft',
      providerMessageId: 'provider-message',
      providerThreadId: 'provider-thread',
      createdAt: NOW,
    });
    await recordOutreachOutcome(connection, {
      threadId: thread.threadId,
      outcome: 'reply-positive',
      actor: 'operator',
      recordedAt: NOW,
    });

    const aggregate = await getOutreachCampaignAggregate(connection, {
      scoringVersion: SCORING_VERSION,
      cohortId,
    });

    expect(aggregate).toEqual({
      scoringVersion: SCORING_VERSION,
      cohortId,
      rows: [
        {
          brokennessDecile: 9,
          abilityHalf: 'upper',
          touch1EvidenceSlot: 'specific-failure',
          outcome: 'reply-positive',
          count: 1,
        },
      ],
    });
    const serialized = JSON.stringify(aggregate);
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain('direction');
    expect(serialized).not.toContain('Sujet confidentiel');
    expect(serialized).not.toContain('Corps confidentiel');
  });
});
