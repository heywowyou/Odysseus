import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { OutreachThreadState } from '@odysseus/core';
import {
  completeOutreachSequence,
  findOutreachThreadById,
  listThreadsDueForFollowUp,
  openOutreachThread,
} from './outreach-threads.js';
import {
  findOutreachPreviewByTokenHash,
  recordOutreachPreview,
  type RecordOutreachPreviewInput,
} from './outreach-previews.js';
import { addSuppressionEntry, isSuppressed } from './suppression.js';
import { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
import { createSuppressionModel } from './schemas/suppression.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('outreach_threads'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const spacing = { touch2AfterDays: 4, touch3AfterDays: 7, replyWindowDays: 14 };
const firstSent = new Date('2026-09-01T09:30:00.000Z');

/** A thread in `state` whose touches 1..n were sent at the given dates. */
async function threadIn(
  state: OutreachThreadState,
  sentTouches: Date[],
  extra: Record<string, unknown> = {},
): Promise<string> {
  const domain = `${randomUUID().slice(0, 8)}.example`;
  const { thread } = await openOutreachThread(connection!, {
    prospectId: randomUUID(),
    previewId: randomUUID(),
    domain,
    roleAddress: `contact@${domain}`,
    language: 'fr',
    openedAt: new Date(firstSent.getTime() - DAY_MS),
    spacing,
    campaignVersion: 'test-campaign',
  });
  await createOutreachThreadModel(connection!).updateOne(
    { threadId: thread.threadId },
    {
      $set: {
        state,
        touches: sentTouches.map((sentAt, index) => ({
          touch: index + 1,
          providerMessageId: `msg-${index + 1}`,
          sentAt,
          detectedAt: sentAt,
        })),
        ...extra,
      },
    },
  );
  return thread.threadId;
}

describe.skipIf(!available)('outreach follow-up timing', () => {
  beforeEach(async () => {
    await createOutreachThreadModel(connection!).deleteMany({});
    await createSuppressionModel(connection!).deleteMany({});
  });

  describe('listThreadsDueForFollowUp', () => {
    it('is due exactly at the spacing boundary and not a millisecond before', async () => {
      const threadId = await threadIn('e1-sent', [firstSent]);
      const boundary = new Date(firstSent.getTime() + spacing.touch2AfterDays * DAY_MS);

      const before = await listThreadsDueForFollowUp(connection!, {
        now: new Date(boundary.getTime() - 1),
      });
      expect(before).toEqual([]);

      const at = await listThreadsDueForFollowUp(connection!, { now: boundary });
      expect(at.map((thread) => thread.threadId)).toEqual([threadId]);
    });

    it('spaces the third touch from the second touch with its own gap', async () => {
      const secondSent = new Date(firstSent.getTime() + 5 * DAY_MS);
      const threadId = await threadIn('e2-sent', [firstSent, secondSent]);
      const boundary = new Date(secondSent.getTime() + spacing.touch3AfterDays * DAY_MS);

      expect(
        await listThreadsDueForFollowUp(connection!, { now: new Date(boundary.getTime() - 1) }),
      ).toEqual([]);
      expect(
        (await listThreadsDueForFollowUp(connection!, { now: boundary })).map((t) => t.threadId),
      ).toEqual([threadId]);
    });

    it('leaves out threads flagged for review, unsent, drafted or finished', async () => {
      const now = new Date(firstSent.getTime() + 30 * DAY_MS);
      await threadIn('e1-sent', [firstSent], {
        needsReview: { reason: 'ambiguous reply', detectedAt: firstSent },
      });
      await threadIn('e1-sent', []);
      await threadIn('e2-drafted', [firstSent]);
      await threadIn('replied', [firstSent]);
      await threadIn('e3-sent', [firstSent, firstSent, firstSent]);
      expect(await listThreadsDueForFollowUp(connection!, { now })).toEqual([]);
    });

    it('stops at the limit, oldest thread first', async () => {
      const now = new Date(firstSent.getTime() + 30 * DAY_MS);
      const first = await threadIn('e1-sent', [firstSent]);
      const second = await threadIn('e1-sent', [firstSent]);
      await threadIn('e1-sent', [firstSent]);
      const Threads = createOutreachThreadModel(connection!);
      await Threads.updateOne({ threadId: first }, { $set: { createdAt: new Date(0) } });
      await Threads.updateOne({ threadId: second }, { $set: { createdAt: new Date(1000) } });

      const due = await listThreadsDueForFollowUp(connection!, { now, limit: 2 });
      expect(due.map((thread) => thread.threadId)).toEqual([first, second]);
    });
  });

  describe('completeOutreachSequence', () => {
    const thirdSent = new Date(firstSent.getTime() + 11 * DAY_MS);
    const windowEnd = new Date(thirdSent.getTime() + spacing.replyWindowDays * DAY_MS);

    it('does nothing before the reply window elapses', async () => {
      const threadId = await threadIn('e3-sent', [firstSent, firstSent, thirdSent]);
      const result = await completeOutreachSequence(connection!, {
        threadId,
        at: new Date(windowEnd.getTime() - 1),
      });
      expect(result.changed).toBe(false);
      const thread = await findOutreachThreadById(connection!, threadId);
      expect(thread?.state).toBe('e3-sent');
      expect(await isSuppressed(connection!, thread!.domain)).toBe(false);
    });

    it('suppresses the domain and closes the sequence once the window elapses', async () => {
      const threadId = await threadIn('e3-sent', [firstSent, firstSent, thirdSent]);
      const result = await completeOutreachSequence(connection!, { threadId, at: windowEnd });
      expect(result.changed).toBe(true);
      const thread = await findOutreachThreadById(connection!, threadId);
      expect(thread?.state).toBe('sequence-complete');
      expect(await isSuppressed(connection!, thread!.domain)).toBe(true);
      const [row] = await createSuppressionModel(connection!).find({}).lean();
      expect(row?.reasonCode).toBe('sequence-complete');
    });

    it('leaves a flagged thread alone', async () => {
      const threadId = await threadIn('e3-sent', [firstSent, firstSent, thirdSent], {
        needsReview: { reason: 'ambiguous reply', detectedAt: thirdSent },
      });
      expect(
        (await completeOutreachSequence(connection!, { threadId, at: windowEnd })).changed,
      ).toBe(false);
      expect(await createSuppressionModel(connection!).countDocuments({})).toBe(0);
    });

    it('writes the suppression before the state change', async () => {
      const threadId = await threadIn('e3-sent', [firstSent, firstSent, thirdSent]);
      const Threads = createOutreachThreadModel(connection!);
      const originalUpdate = Threads.findOneAndUpdate;
      Threads.findOneAndUpdate = (() => {
        throw new Error('state write failed');
      }) as never;
      try {
        await expect(
          completeOutreachSequence(connection!, { threadId, at: windowEnd }),
        ).rejects.toThrow('state write failed');
      } finally {
        Threads.findOneAndUpdate = originalUpdate;
      }
      const thread = await findOutreachThreadById(connection!, threadId);
      expect(thread?.state).toBe('e3-sent');
      expect(await isSuppressed(connection!, thread!.domain)).toBe(true);
    });

    it('never moves the thread when the suppression write fails', async () => {
      const threadId = await threadIn('e3-sent', [firstSent, firstSent, thirdSent]);
      const Suppression = createSuppressionModel(connection!);
      const originalUpdate = Suppression.updateOne;
      Suppression.updateOne = (() => {
        throw new Error('suppression write failed');
      }) as never;
      try {
        await expect(
          completeOutreachSequence(connection!, { threadId, at: windowEnd }),
        ).rejects.toThrow('suppression write failed');
      } finally {
        Suppression.updateOne = originalUpdate;
      }
      expect((await findOutreachThreadById(connection!, threadId))?.state).toBe('e3-sent');
    });
  });
});

describe.skipIf(!available)('outreach preview recording', () => {
  function previewInput(domain: string, tokenHash: string): RecordOutreachPreviewInput {
    return {
      prospectId: randomUUID(),
      tokenHash,
      objectKey: `previews/${tokenHash}.html`,
      previewUrl: `https://preview.example/${tokenHash}`,
      domain,
      language: 'fr',
      previewContentVersion: 'v1',
      publishedAt: new Date('2026-09-10T10:00:00.000Z'),
      sourceKind: 'full-audit',
      auditId: randomUUID(),
    };
  }

  it('records a live preview findable by its token hash', async () => {
    const result = await recordOutreachPreview(
      connection!,
      previewInput('live.example', 'hash-live'),
    );
    expect(result.outcome).toBe('recorded');

    const stored = await findOutreachPreviewByTokenHash(connection!, 'hash-live');
    expect(stored?.previewId).toBe(result.previewId);
    expect(stored?.status).toBe('live');
    expect(stored?.previewUrl).toBe('https://preview.example/hash-live');
    expect(await findOutreachPreviewByTokenHash(connection!, 'hash-unknown')).toBeNull();
  });

  it('revokes a preview whose domain was suppressed before the record landed', async () => {
    await addSuppressionEntry(connection!, {
      domain: 'objected.example',
      reasonCode: 'objection',
      reason: 'objected while the preview was publishing',
    });

    const result = await recordOutreachPreview(
      connection!,
      previewInput('objected.example', 'hash-objected'),
    );

    expect(result.outcome).toBe('refused-suppressed');
    const stored = await findOutreachPreviewByTokenHash(connection!, 'hash-objected');
    expect(stored?.previewId).toBe(result.previewId);
    expect(stored?.status).toBe('revoked');
    expect(stored?.revokedReason).toBe('domain-suppressed');
    expect(stored?.previewUrl).toBeUndefined();
  });

  it('still records when only another address at the domain opted out', async () => {
    await addSuppressionEntry(connection!, {
      domain: 'shared.example',
      address: 'someone@shared.example',
      addressOnly: true,
      reasonCode: 'objection',
      reason: 'address-only opt-out',
    });
    const result = await recordOutreachPreview(
      connection!,
      previewInput('shared.example', 'hash-shared'),
    );
    expect(result.outcome).toBe('recorded');
  });

  describe.skipIf(!available)('openOutreachThread on an existing thread (issue #482)', () => {
    const input = (language: 'fr' | 'en', roleAddress: string, previewId: string) => ({
      prospectId,
      previewId,
      domain: 'hotel-reopen.example',
      roleAddress,
      language,
      openedAt: firstSent,
      spacing,
      campaignVersion: 'test-campaign',
    });
    let prospectId: string;

    beforeEach(() => {
      prospectId = randomUUID();
    });

    it('takes the new language, recipient and preview before the first email is sent', async () => {
      const first = await openOutreachThread(
        connection!,
        input('fr', 'a@hotel-reopen.example', 'p1'),
      );
      const again = await openOutreachThread(
        connection!,
        input('en', 'b@hotel-reopen.example', 'p2'),
      );

      expect(again.created).toBe(false);
      expect(again.thread.threadId).toBe(first.thread.threadId);
      expect(again.thread).toMatchObject({
        language: 'en',
        roleAddress: 'b@hotel-reopen.example',
        previewId: 'p2',
      });
      expect(await findOutreachThreadById(connection!, first.thread.threadId)).toMatchObject({
        language: 'en',
        roleAddress: 'b@hotel-reopen.example',
      });
    });

    it('leaves the thread alone once the first email has been sent', async () => {
      const first = await openOutreachThread(
        connection!,
        input('en', 'b@hotel-reopen.example', 'p1'),
      );
      await createOutreachThreadModel(connection!).updateOne(
        { threadId: first.thread.threadId },
        { $set: { state: 'e1-sent' } },
      );

      const again = await openOutreachThread(
        connection!,
        input('fr', 'a@hotel-reopen.example', 'p2'),
      );

      expect(again.thread).toMatchObject({ language: 'en', roleAddress: 'b@hotel-reopen.example' });
    });
  });
});
