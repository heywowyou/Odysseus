import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FIRST_OUTREACH_CAMPAIGN_VERSION, type OutreachOutcome } from '@odysseus/core';
import { aggregateOutreachFunnel } from './outreach-funnel.js';
import { openOutreachThread } from './outreach-threads.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('outreach_funnel'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const spacing = { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 };
const openedAt = new Date('2026-09-24T08:00:00.000Z');

async function seedThread(options: {
  campaignVersion?: string;
  state: string;
  touchesSent: number;
  outcome?: OutreachOutcome;
}): Promise<void> {
  const threadId = randomUUID();
  const prospectId = randomUUID();
  const outcomeId = options.outcome === undefined ? undefined : randomUUID();
  await createOutreachThreadModel(connection!).collection.insertOne({
    threadId,
    prospectId,
    previewId: randomUUID(),
    domain: `${prospectId.slice(0, 8)}.example`,
    roleAddress: 'contact@example.fr',
    language: 'fr',
    languageSource: 'operator',
    currentTouch: options.touchesSent,
    state: options.state,
    stateEnteredAt: openedAt,
    touches: Array.from({ length: options.touchesSent }, (_, index) => ({
      touch: index + 1,
      providerMessageId: `msg-${index + 1}`,
      sentAt: openedAt,
      detectedAt: openedAt,
    })),
    spacing,
    ...(options.campaignVersion === undefined ? {} : { campaignVersion: options.campaignVersion }),
    ...(outcomeId === undefined ? {} : { currentOutcome: outcomeId }),
    createdAt: openedAt,
    updatedAt: openedAt,
    expiresAt: new Date('2026-12-23T08:00:00.000Z'),
  });
  if (outcomeId !== undefined && options.outcome !== undefined) {
    await createOutreachOutcomeModel(connection!).create({
      outcomeId,
      idempotencyKey: randomUUID(),
      threadId,
      prospectId,
      outcome: options.outcome,
      actor: 'operator',
      recordedAt: openedAt,
      expiresAt: new Date('2026-12-23T08:00:00.000Z'),
    });
  }
}

describe.skipIf(!available)('outreach funnel (issue #533)', () => {
  beforeAll(async () => {
    // The first campaign's threads predate the field.
    await seedThread({ state: 'e1-sent', touchesSent: 1 });
    await seedThread({ state: 'replied', touchesSent: 1, outcome: 'reply-positive' });
    await seedThread({ state: 'bounced', touchesSent: 1 });
    await seedThread({ state: 'closed', touchesSent: 2, outcome: 'won' });
    await seedThread({ state: 'opted-out', touchesSent: 1, outcome: 'opt-out' });
    await seedThread({ state: 'open', touchesSent: 0 });
    // A second campaign, tagged.
    await seedThread({ campaignVersion: 'batch-2', state: 'e3-sent', touchesSent: 3 });
    await seedThread({
      campaignVersion: 'batch-2',
      state: 'replied',
      touchesSent: 3,
      outcome: 'reply-not-now',
    });
  });

  it('counts sent, replied, bounced, opted-out and won per campaign', async () => {
    const funnels = await aggregateOutreachFunnel(connection!);
    const first = funnels.find((f) => f.campaignVersion === FIRST_OUTREACH_CAMPAIGN_VERSION);
    const second = funnels.find((f) => f.campaignVersion === 'batch-2');

    expect(first).toMatchObject({
      threads: 6,
      firstTouchSent: 5,
      replied: 2,
      bounced: 1,
      optedOut: 1,
      won: 1,
      repliesAfterTouch: { 1: 1, 2: 1, 3: 0 },
    });
    expect(first!.outcomes).toMatchObject({ 'reply-positive': 1, won: 1, 'opt-out': 1 });
    expect(second).toMatchObject({
      threads: 2,
      firstTouchSent: 2,
      replied: 1,
      bounced: 0,
      optedOut: 0,
      won: 0,
      repliesAfterTouch: { 1: 0, 2: 0, 3: 1 },
    });
  });

  it('carries counts only, never an identifier', async () => {
    const serialized = JSON.stringify(await aggregateOutreachFunnel(connection!));
    expect(serialized).not.toMatch(/example|contact@|[0-9a-f]{8}-[0-9a-f]{4}-/u);
  });

  it('stamps the campaign when a thread opens and keeps it when the thread is reopened', async () => {
    const prospectId = randomUUID();
    const input = {
      prospectId,
      previewId: randomUUID(),
      domain: 'stamp.example',
      roleAddress: 'contact@stamp.example',
      language: 'fr' as const,
      openedAt,
      spacing,
    };
    const opened = await openOutreachThread(connection!, { ...input, campaignVersion: 'batch-3' });
    expect(opened.thread.campaignVersion).toBe('batch-3');
    const reopened = await openOutreachThread(connection!, {
      ...input,
      campaignVersion: 'batch-4',
    });
    expect(reopened.created).toBe(false);
    expect(reopened.thread.campaignVersion).toBe('batch-3');
  });
});
