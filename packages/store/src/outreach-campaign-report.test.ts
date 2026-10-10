import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { OutreachLostReason, OutreachOutcome } from '@odysseus/core';
import {
  aggregateOutreachFunnel,
  listOutreachFunnelSnapshots,
  recordOutreachFunnelSnapshot,
  reportOutreachCampaigns,
} from './outreach-funnel.js';
import { createOutreachFunnelSnapshotModel } from './schemas/outreach-funnel-snapshot.schema.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('outreach_campaign_report'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const spacing = { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 };
const now = new Date('2026-10-10T09:00:00.000Z');
const day = (value: string): Date => new Date(`${value}T08:00:00.000Z`);

interface SeedThread {
  campaignVersion: string;
  state: string;
  stateReason?: string;
  /** Sent dates of touches 1 to 3, in order. */
  sent?: string[];
  firstTouchByOperator?: boolean;
  outcome?: OutreachOutcome;
  lostReason?: OutreachLostReason;
  /** `false` stores no prospect row at all. */
  hotel?: { stars?: number; groupStatus?: string } | false | undefined;
  /** The preview's three card categories; `false` stores no preview row. */
  cards?: string[] | false | undefined;
}

/** Stores the threads with their outcome, prospect and preview rows, one
 *  write per collection whatever the number of threads. */
async function seedThreads(list: readonly SeedThread[]): Promise<void> {
  const threads: Record<string, unknown>[] = [];
  const outcomes: Record<string, unknown>[] = [];
  const prospects: Record<string, unknown>[] = [];
  const previews: Record<string, unknown>[] = [];
  for (const options of list) {
    const threadId = randomUUID();
    const prospectId = randomUUID();
    const previewId = randomUUID();
    const outcomeId = options.outcome === undefined ? undefined : randomUUID();
    const sent = options.sent ?? [];
    threads.push({
      threadId,
      prospectId,
      previewId,
      domain: `${prospectId.slice(0, 8)}.example`,
      roleAddress: 'contact@example.fr',
      language: 'fr',
      languageSource: 'operator',
      currentTouch: sent.length,
      state: options.state,
      stateEnteredAt: now,
      ...(options.stateReason === undefined ? {} : { stateReason: options.stateReason }),
      touches: sent.map((sentDay, index) => ({
        touch: index + 1,
        ...(index === 0 && options.firstTouchByOperator === true
          ? { confirmedBy: 'operator' }
          : { providerMessageId: `msg-${index + 1}` }),
        sentAt: day(sentDay),
        detectedAt: day(sentDay),
      })),
      spacing,
      campaignVersion: options.campaignVersion,
      ...(outcomeId === undefined ? {} : { currentOutcome: outcomeId }),
      createdAt: day(sent[0] ?? '2026-09-20'),
      updatedAt: now,
      expiresAt: new Date('2027-01-10T08:00:00.000Z'),
    });
    if (outcomeId !== undefined) {
      outcomes.push({
        outcomeId,
        idempotencyKey: outcomeId,
        threadId,
        prospectId,
        outcome: options.outcome,
        ...(options.lostReason === undefined ? {} : { lostReason: options.lostReason }),
        actor: 'operator',
        recordedAt: now,
        expiresAt: new Date('2027-01-10T08:00:00.000Z'),
      });
    }
    if (options.hotel !== false) {
      prospects.push({
        prospectId,
        name: `Hôtel ${prospectId.slice(0, 8)}`,
        sector: 'hotel',
        ...(options.hotel === undefined ? {} : { hotel: options.hotel }),
      });
    }
    if (options.cards !== false) {
      previews.push({
        previewId,
        prospectId,
        tokenHash: randomUUID(),
        domain: `${prospectId.slice(0, 8)}.example`,
        ...(options.cards === undefined
          ? {}
          : { publishedFacts: { priorityCardCategories: options.cards } }),
      });
    }
  }
  const insert = async (
    model: { collection: { insertMany: (docs: Record<string, unknown>[]) => Promise<unknown> } },
    docs: Record<string, unknown>[],
  ): Promise<void> => {
    if (docs.length > 0) await model.collection.insertMany(docs);
  };
  await insert(createOutreachThreadModel(connection!), threads);
  await insert(createOutreachOutcomeModel(connection!), outcomes);
  await insert(createProspectHubModel(connection!), prospects);
  await insert(createOutreachPreviewModel(connection!), previews);
}

const IDENTIFIER_KEYS = /"(prospectId|threadId|previewId|domain|roleAddress|name)"/u;
const IDENTIFIER_VALUES = /example|contact@|Hôtel|[0-9a-f]{8}-[0-9a-f]{4}-/u;

describe.skipIf(!available)('campaign results (plan 078)', () => {
  const campaign = 'results';
  const hotel = { stars: 4, groupStatus: 'independent' };
  const cards = ['accessibility', 'seo', 'performance'];

  beforeAll(async () => {
    const base = { campaignVersion: campaign, hotel, cards };
    const seeded: SeedThread[] = [];
    const seedThread = (options: SeedThread): void => void seeded.push(options);
    // Prepared, never sent.
    seedThread({ ...base, state: 'e1-drafted' });
    // In sequence: matures 1 Oct + 29 days, and 20 Sept + 4 + ... from touch 2.
    seedThread({ ...base, state: 'e1-sent', sent: ['2026-10-01'] });
    seedThread({ ...base, state: 'e2-sent', sent: ['2026-09-20', '2026-09-25'] });
    // Reply window: matures 6 Oct + 14 days.
    seedThread({
      ...base,
      state: 'e3-sent',
      sent: ['2026-09-15', '2026-09-20', '2026-10-06'],
    });
    // Replied: one positive after touch 1, one refusal after touch 2 with its
    // reason, one refusal recorded before reasons existed, one objection.
    seedThread({
      ...base,
      state: 'replied',
      sent: ['2026-09-10'],
      outcome: 'reply-positive',
    });
    seedThread({
      ...base,
      state: 'replied',
      sent: ['2026-09-10', '2026-09-15'],
      outcome: 'reply-negative',
      lostReason: 'misread-offer',
      hotel: { stars: 3, groupStatus: 'group-member' },
      cards: ['seo', 'performance', 'rendering'],
    });
    seedThread({ ...base, state: 'replied', sent: ['2026-09-10'], outcome: 'lost' });
    seedThread({ ...base, state: 'opted-out', sent: ['2026-09-10'] });
    // Matured without a reply, then one that answered late.
    seedThread({
      ...base,
      state: 'sequence-complete',
      sent: ['2026-08-20', '2026-08-25', '2026-09-05'],
    });
    seedThread({
      ...base,
      state: 'sequence-complete',
      sent: ['2026-08-20', '2026-08-25', '2026-09-05'],
      outcome: 'reply-not-now',
      lostReason: 'timing',
    });
    // Not delivered: a bounce, and a first email merged into another message.
    seedThread({ ...base, state: 'bounced', sent: ['2026-09-10'] });
    seedThread({
      ...base,
      state: 'closed',
      stateReason: 'operator-confirmed-send',
      sent: ['2026-09-10'],
      firstTouchByOperator: true,
    });
    // Closed for a reason nothing maps.
    seedThread({
      ...base,
      state: 'closed',
      stateReason: 'a reason added later',
      sent: ['2026-09-10'],
    });
    // Delivered threads whose facets are missing: no prospect, no stars or
    // group status, no preview, and a preview stored before the cards were.
    seedThread({ ...base, state: 'e1-sent', sent: ['2026-10-02'], hotel: false });
    seedThread({ ...base, state: 'e1-sent', sent: ['2026-10-02'], hotel: undefined });
    seedThread({ ...base, state: 'e1-sent', sent: ['2026-10-02'], cards: false });
    seedThread({ ...base, state: 'e1-sent', sent: ['2026-10-02'], cards: undefined });
    await seedThreads(seeded);
  });

  const results = async () =>
    (await aggregateOutreachFunnel(connection!, now)).find(
      (funnel) => funnel.campaignVersion === campaign,
    )!;

  it('puts every thread in one maturity bucket', async () => {
    const { threads, results: counted } = await results();
    expect(counted.maturity).toEqual({
      prepared: 1,
      'in-sequence': 6,
      'reply-window': 1,
      'matured-replied': 5,
      'matured-silent': 1,
      undelivered: 1,
      merged: 1,
      'closed-other': 1,
    });
    expect(Object.values(counted.maturity).reduce((sum, value) => sum + value, 0)).toBe(threads);
  });

  it('counts delivered without bounced and merged, and matured as replied or closed silent', async () => {
    const { results: counted, firstTouchSent } = await results();
    expect(firstTouchSent).toBe(16);
    expect(counted).toMatchObject({
      delivered: 14,
      matured: 6,
      positiveReplies: 1,
      objections: 1,
      repliesByLastTouch: { 1: 3, 2: 1, 3: 1 },
    });
  });

  it('counts each decline reason, and a refusal without one as unspecified', async () => {
    const { declineReasons } = (await results()).results;
    expect(declineReasons).toMatchObject({
      'misread-offer': 1,
      timing: 1,
      unspecified: 1,
      budget: 0,
    });
  });

  it('reads segments from stored facets only, and counts a missing one as unknown', async () => {
    const { segments } = (await results()).results;
    expect(segments.stars['4']).toEqual({
      delivered: 11,
      matured: 5,
      replies: 4,
      positiveReplies: 1,
    });
    expect(segments.stars['3']).toEqual({
      delivered: 1,
      matured: 1,
      replies: 1,
      positiveReplies: 0,
    });
    // No prospect row, and a prospect with no hotel facets.
    expect(segments.stars.unknown.delivered).toBe(2);
    expect(segments.groupStatus.unknown.delivered).toBe(2);
    expect(segments.groupStatus['group-member'].delivered).toBe(1);
    // No preview row, and a preview without stored card categories.
    expect(segments.accessibilityCard).toMatchObject({
      yes: { delivered: 11 },
      no: { delivered: 1 },
      unknown: { delivered: 2 },
    });
    for (const facet of Object.values(segments)) {
      const delivered = Object.values(facet).reduce((sum, row) => sum + row.delivered, 0);
      expect(delivered).toBe(14);
    }
  });

  it('gives the projection its days and counts, oldest maturity first', async () => {
    const { projection } = await results();
    expect(projection).toEqual({
      firstSendDay: '2026-08-20',
      // 1 October and the four of 2 October; 26 September is outside 14 days.
      recentFirstTouchSends: 5,
      sequenceDays: 29,
      pendingMaturity: [
        { day: '2026-10-20', threads: 2 },
        { day: '2026-10-30', threads: 1 },
        { day: '2026-10-31', threads: 4 },
      ],
    });
  });

  it('carries no identifier in the API payload or in the stored snapshot', async () => {
    const payload = JSON.stringify({ campaigns: await reportOutreachCampaigns(connection!, now) });
    await recordOutreachFunnelSnapshot(connection!, now);
    const stored = JSON.stringify(
      await createOutreachFunnelSnapshotModel(connection!).find({}).lean(),
    );
    for (const serialized of [payload, stored.replace(/"_id":"[0-9a-f]+",?/gu, '')]) {
      expect(serialized).not.toMatch(IDENTIFIER_KEYS);
      expect(serialized).not.toMatch(IDENTIFIER_VALUES);
    }
    expect(payload).toContain('"checkpoints"');
  });

  it('keeps the results in the daily snapshot, without the projection inputs', async () => {
    await recordOutreachFunnelSnapshot(connection!, now);
    const row = (await listOutreachFunnelSnapshots(connection!)).find(
      (snapshot) => snapshot.campaignVersion === campaign && snapshot.day === '2026-10-10',
    );
    expect(row!.results).toEqual((await results()).results);
    expect(row).not.toHaveProperty('projection');
  });
});

describe.skipIf(!available)('campaign report reads (plan 078)', () => {
  /** Collection operations Mongoose issues while `run` executes. Index
   *  builds are finished first: they run in the background after a model's
   *  first use and are not part of the aggregate. */
  async function countReads(run: () => Promise<unknown>): Promise<string[]> {
    await Promise.all(
      [
        createOutreachThreadModel(connection!),
        createOutreachOutcomeModel(connection!),
        createOutreachPreviewModel(connection!),
        createProspectHubModel(connection!),
      ].map((model) => model.init()),
    );
    const reads: string[] = [];
    mongoose.set('debug', (collection: string, method: string) => {
      reads.push(`${collection}.${method}`);
    });
    try {
      await run();
    } finally {
      mongoose.set('debug', false);
    }
    return reads;
  }

  it('reads the same collections once each for 5 and for 500 threads', async () => {
    const seed = (count: number): Promise<void> =>
      seedThreads(
        Array.from({ length: count }, () => ({
          campaignVersion: 'reads',
          state: 'replied',
          sent: ['2026-09-10'],
          outcome: 'reply-positive' as const,
          hotel: { stars: 3 },
          cards: ['seo', 'geo', 'privacy'],
        })),
      );
    await seed(5);
    const few = await countReads(() => aggregateOutreachFunnel(connection!, now));
    await seed(495);
    const many = await countReads(() => aggregateOutreachFunnel(connection!, now));

    expect([...few].sort()).toEqual([
      'outreach_outcomes.find',
      'outreach_previews.find',
      'outreach_threads.find',
      'prospects.find',
    ]);
    expect([...many].sort()).toEqual([...few].sort());
    const funnel = (await aggregateOutreachFunnel(connection!, now)).find(
      (entry) => entry.campaignVersion === 'reads',
    );
    expect(funnel!.results.positiveReplies).toBe(500);
  });
});

describe.skipIf(!available)('checkpoints and snapshot history (plan 078)', () => {
  it('reads a snapshot stored before the results existed, and dates a reached checkpoint from the first one that shows it', async () => {
    const campaignVersion = 'reads';
    const Snapshots = createOutreachFunnelSnapshotModel(connection!);
    // A row as issue #561 wrote it, before this plan.
    await Snapshots.collection.insertOne({
      day: '2026-10-01',
      campaignVersion,
      threads: 80,
      firstTouchSent: 80,
      replied: 2,
      bounced: 0,
      optedOut: 0,
      won: 0,
      repliesAfterTouch: { 1: 2, 2: 0, 3: 0 },
      outcomes: {},
      takenAt: day('2026-10-01'),
    });
    const before = (await listOutreachFunnelSnapshots(connection!)).find(
      (row) => row.campaignVersion === campaignVersion && row.day === '2026-10-01',
    );
    expect(before).toMatchObject({ threads: 80, replied: 2 });
    expect(before!.results).toBeUndefined();

    // 500 matured replies are stored for this campaign by the test above.
    await recordOutreachFunnelSnapshot(connection!, day('2026-10-08'));
    await recordOutreachFunnelSnapshot(connection!, day('2026-10-09'));
    const report = (await reportOutreachCampaigns(connection!, now)).find(
      (entry) => entry.campaignVersion === campaignVersion,
    );
    expect(report!.checkpoints).toEqual([
      {
        checkpoint: 100,
        kind: 'reached',
        reachedOn: { day: '2026-10-08', replies: 500, positiveReplies: 500 },
      },
      {
        checkpoint: 300,
        kind: 'reached',
        reachedOn: { day: '2026-10-08', replies: 500, positiveReplies: 500 },
      },
      {
        checkpoint: 500,
        kind: 'reached',
        reachedOn: { day: '2026-10-08', replies: 500, positiveReplies: 500 },
      },
    ]);
  });

  it('reports a reached checkpoint without a day when no snapshot shows it yet', async () => {
    await createOutreachFunnelSnapshotModel(connection!).deleteMany({});
    const report = (await reportOutreachCampaigns(connection!, now)).find(
      (entry) => entry.campaignVersion === 'reads',
    );
    expect(report!.checkpoints[0]).toEqual({ checkpoint: 100, kind: 'reached' });
  });
});
