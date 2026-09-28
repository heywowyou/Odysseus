import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { FIRST_OUTREACH_CAMPAIGN_VERSION } from '@odysseus/core';
import { listOutreachFunnelSnapshots, recordOutreachFunnelSnapshot } from './outreach-funnel.js';
import { createOutreachFunnelSnapshotModel } from './schemas/outreach-funnel-snapshot.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('outreach_funnel_snapshot'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const openedAt = new Date('2026-09-24T08:00:00.000Z');

async function seedThread(state: string, touchesSent: number): Promise<void> {
  const prospectId = randomUUID();
  await createOutreachThreadModel(connection!).collection.insertOne({
    threadId: randomUUID(),
    prospectId,
    previewId: randomUUID(),
    domain: `${prospectId.slice(0, 8)}.example`,
    roleAddress: 'contact@example.fr',
    language: 'fr',
    languageSource: 'operator',
    currentTouch: touchesSent,
    state,
    stateEnteredAt: openedAt,
    touches: Array.from({ length: touchesSent }, (_, index) => ({
      touch: index + 1,
      providerMessageId: `msg-${index + 1}`,
      sentAt: openedAt,
      detectedAt: openedAt,
    })),
    spacing: { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 },
    createdAt: openedAt,
    updatedAt: openedAt,
    expiresAt: new Date('2026-12-23T08:00:00.000Z'),
  });
}

/** Every leaf value of a snapshot other than its keys and timestamp. */
function leaves(value: unknown): unknown[] {
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(leaves);
  return [value];
}

describe.skipIf(!available)('outreach funnel snapshots (issue #561)', () => {
  it('stores counts per day and campaign, replaces a same-day rerun, and outlives the records', async () => {
    await seedThread('e1-sent', 1);
    await seedThread('replied', 1);
    const morning = new Date('2026-09-28T06:00:00.000Z');
    expect(await recordOutreachFunnelSnapshot(connection!, morning)).toBe(1);

    const [snapshot] = await listOutreachFunnelSnapshots(connection!);
    const { day, campaignVersion, takenAt, ...counts } = snapshot!;
    expect(day).toBe('2026-09-28');
    expect(campaignVersion).toBe(FIRST_OUTREACH_CAMPAIGN_VERSION);
    expect(takenAt).toEqual(morning);
    expect(leaves(counts).every((leaf) => typeof leaf === 'number')).toBe(true);
    expect(counts).toMatchObject({ threads: 2, firstTouchSent: 2, replied: 1 });
    expect(JSON.stringify(snapshot)).not.toMatch(/example|contact@|[0-9a-f]{8}-[0-9a-f]{4}-/u);

    // A second run the same day replaces the first.
    await seedThread('bounced', 1);
    const evening = new Date('2026-09-28T20:00:00.000Z');
    await recordOutreachFunnelSnapshot(connection!, evening);
    const sameDay = await listOutreachFunnelSnapshots(connection!);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0]).toMatchObject({ threads: 3, bounced: 1, takenAt: evening });

    // The records expire; the snapshots stay and the next day adds none.
    await createOutreachThreadModel(connection!).deleteMany({});
    await createOutreachOutcomeModel(connection!).deleteMany({});
    expect(
      await recordOutreachFunnelSnapshot(connection!, new Date('2026-09-29T06:00:00.000Z')),
    ).toBe(0);
    const after = await listOutreachFunnelSnapshots(connection!);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ day: '2026-09-28', threads: 3 });
    const indexes = await createOutreachFunnelSnapshotModel(connection!).collection.indexes();
    expect(indexes.some((index) => index.expireAfterSeconds !== undefined)).toBe(false);
  });
});
