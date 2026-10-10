import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { OutreachThreadState } from '@odysseus/core';
import { backfillOutreachThreadOutcomes } from './outreach-outcomes.js';
import { aggregateOutreachFunnel } from './outreach-funnel.js';
import {
  findOutreachThreadByProspect,
  openOutreachThread,
  recordOutreachThreadTouchSent,
  transitionOutreachThread,
} from './outreach-threads.js';
import {
  createProspectHub,
  listProspectEvents,
  listProspectTodo,
  recordProspectOutcome,
} from './prospect-hub.js';
import { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('outreach_outcomes'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const spacing = { touch2AfterDays: 4, touch3AfterDays: 11, replyWindowDays: 14 };
const sentAt = new Date('2026-09-24T08:00:00.000Z');

/** A prospect whose first email was sent, optionally answered. */
async function contactedProspect(
  name: string,
  campaignVersion: string,
  replied = false,
): Promise<string> {
  const domain = `${randomUUID().slice(0, 8)}.example`;
  const prospect = await createProspectHub(connection!, {
    sector: 'hotel',
    name,
    websites: [
      { url: `https://${domain}/`, registrableDomain: domain, kind: 'own', primary: true },
    ],
    emails: [{ address: `contact@${domain}`, origin: 'operator' }],
  });
  const { thread } = await openOutreachThread(connection!, {
    prospectId: prospect.prospectId,
    previewId: randomUUID(),
    domain,
    roleAddress: `contact@${domain}`,
    language: 'fr',
    openedAt: sentAt,
    spacing,
    campaignVersion,
  });
  await recordOutreachThreadTouchSent(connection!, thread.threadId, {
    touch: 1,
    providerMessageId: 'msg-1',
    sentAt,
    detectedAt: sentAt,
  });
  const at = new Date();
  const moves: [OutreachThreadState, OutreachThreadState][] = [
    ['open', 'e1-drafted'],
    ['e1-drafted', 'e1-sent'],
    ...(replied ? ([['e1-sent', 'replied']] as [OutreachThreadState, OutreachThreadState][]) : []),
  ];
  for (const [from, to] of moves) {
    await transitionOutreachThread(connection!, {
      threadId: thread.threadId,
      from: [from],
      to,
      at,
    });
  }
  return prospect.prospectId;
}

describe.skipIf(!available)('a recorded outcome reaches the thread and the funnel', () => {
  it('writes the outcome row, points the thread at it, and the funnel counts the win', async () => {
    const prospectId = await contactedProspect('Won Fixture', 'campaign-won', true);

    await recordProspectOutcome(connection!, prospectId, 'won', 'operator', {
      idempotencyKey: 'request-1',
    });

    const thread = await findOutreachThreadByProspect(connection!, prospectId);
    const rows = await createOutreachOutcomeModel(connection!).find({ prospectId }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'won', threadId: thread!.threadId });
    expect(thread!.currentOutcome).toBe(rows[0]!.outcomeId);
    const funnel = (await aggregateOutreachFunnel(connection!)).find(
      (campaign) => campaign.campaignVersion === 'campaign-won',
    );
    expect(funnel).toMatchObject({ won: 1, replied: 1 });
    expect(funnel!.outcomes.won).toBe(1);
  });

  it('records nothing twice when the same request is repeated', async () => {
    const prospectId = await contactedProspect('Retry Fixture', 'campaign-retry', true);
    const options = { idempotencyKey: 'request-retry' };

    await recordProspectOutcome(connection!, prospectId, 'reply-positive', 'operator', options);
    await recordProspectOutcome(connection!, prospectId, 'reply-positive', 'operator', options);

    await expect(
      createOutreachOutcomeModel(connection!).countDocuments({ prospectId }),
    ).resolves.toBe(1);
    const events = await listProspectEvents(connection!, prospectId);
    expect(events.filter((event) => event.type === 'outcome-recorded')).toHaveLength(1);
  });

  it('points the thread at the latest outcome and keeps the earlier row', async () => {
    const prospectId = await contactedProspect('Progress Fixture', 'campaign-progress', true);

    await recordProspectOutcome(connection!, prospectId, 'reply-positive');
    await recordProspectOutcome(connection!, prospectId, 'lost', 'operator', {
      lostReason: 'budget',
    });

    const rows = await createOutreachOutcomeModel(connection!)
      .find({ prospectId })
      .sort({ recordedAt: 1 })
      .lean();
    expect(rows.map((row) => row.outcome)).toEqual(['reply-positive', 'lost']);
    expect(rows[1]!.lostReason).toBe('budget');
    const thread = await findOutreachThreadByProspect(connection!, prospectId);
    expect(thread!.currentOutcome).toBe(rows[1]!.outcomeId);
  });

  it('keeps the status and the event of a prospect that has no thread', async () => {
    const prospect = await createProspectHub(connection!, { sector: 'hotel', name: 'No Thread' });

    const recorded = await recordProspectOutcome(connection!, prospect.prospectId, 'call');

    expect(recorded?.status).toBe('call');
    await expect(
      createOutreachOutcomeModel(connection!).countDocuments({ prospectId: prospect.prospectId }),
    ).resolves.toBe(0);
  });

  // Before the outcome reached the thread, this row only left To do when the
  // prospect became won, lost or opted out: a reply recorded as positive,
  // not now, a call or a quote kept asking for an outcome for ever.
  it('clears the To do row that asks for the outcome of a reply', async () => {
    const prospectId = await contactedProspect('Reply Fixture', 'campaign-reply', true);
    const asksForOutcome = async (): Promise<boolean> =>
      (await listProspectTodo(connection!)).some(
        (row) => row.prospectId === prospectId && row.action === 'record-outcome',
      );
    await expect(asksForOutcome()).resolves.toBe(true);

    await recordProspectOutcome(connection!, prospectId, 'reply-positive');

    await expect(asksForOutcome()).resolves.toBe(false);
  });
});

describe.skipIf(!available)('backfilling outcomes recorded before they reached the thread', () => {
  it('writes only the missing pointer, and nothing on a dry run', async () => {
    const pointed = await contactedProspect('Already Pointed', 'campaign-backfill', true);
    await recordProspectOutcome(connection!, pointed, 'reply-not-now');
    const pointedBefore = await findOutreachThreadByProspect(connection!, pointed);

    // The state the defect left behind: the event exists, the thread has no
    // pointer and no outcome row was written.
    const missing = await contactedProspect('Missing Pointer', 'campaign-backfill', true);
    await recordProspectOutcome(connection!, missing, 'reply-negative', 'operator', {
      lostReason: 'timing',
    });
    await createOutreachOutcomeModel(connection!).deleteMany({ prospectId: missing });
    await createOutreachThreadModel(connection!).updateOne(
      { prospectId: missing },
      { $unset: { currentOutcome: '' } },
    );
    // No outcome was ever recorded for this one.
    const silent = await contactedProspect('Never Recorded', 'campaign-backfill');
    const Outcomes = createOutreachOutcomeModel(connection!);
    const rowsBefore = await Outcomes.countDocuments({});

    const dryRun = await backfillOutreachThreadOutcomes(connection!, { apply: false });

    expect(dryRun.written).toBe(0);
    expect(dryRun.recoverable).toBeGreaterThanOrEqual(1);
    await expect(Outcomes.countDocuments({})).resolves.toBe(rowsBefore);
    expect((await findOutreachThreadByProspect(connection!, missing))!.currentOutcome).toBe(
      undefined,
    );

    const applied = await backfillOutreachThreadOutcomes(connection!, { apply: true });

    expect(applied.written).toBe(dryRun.recoverable);
    const repaired = await findOutreachThreadByProspect(connection!, missing);
    const row = await Outcomes.findOne({ prospectId: missing }).lean();
    expect(row).toMatchObject({ outcome: 'reply-negative', lostReason: 'timing' });
    expect(repaired!.currentOutcome).toBe(row!.outcomeId);
    expect((await findOutreachThreadByProspect(connection!, pointed))!.currentOutcome).toBe(
      pointedBefore!.currentOutcome,
    );
    expect((await findOutreachThreadByProspect(connection!, silent))!.currentOutcome).toBe(
      undefined,
    );
    // A second run finds nothing left to write.
    await expect(
      backfillOutreachThreadOutcomes(connection!, { apply: true }),
    ).resolves.toMatchObject({ written: 0 });
  });
});
