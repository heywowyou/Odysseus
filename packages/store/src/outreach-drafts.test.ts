import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import {
  DuplicateLiveDraftError,
  findLiveOutreachDraft,
  findOutreachDraftById,
  listOutreachDrafts,
  markOutreachDraftDeleted,
  OUTREACH_DRAFT_RETENTION_DAYS,
  recordFailedOutreachDraft,
  recordOutreachDraft,
  recordOutreachDraftReview,
  type RecordOutreachDraftInput,
} from './outreach-drafts.js';
import { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const CREATED_AT = new Date('2026-08-30T09:00:00.000Z');
const BODY = 'Bonjour,\n\nUn constat mesuré sur votre site.\n\nCordialement';
const HTML_BODY =
  '<div dir="ltr"><div>Bonjour,</div><div>Un constat mesuré sur votre site.</div></div>';

function input(overrides: Partial<RecordOutreachDraftInput> = {}): RecordOutreachDraftInput {
  return {
    threadId: randomUUID(),
    candidateId: randomUUID(),
    touch: 1,
    language: 'fr',
    roleAddress: 'direction@hotel-exemple.fr',
    subject: 'Votre site web',
    body: BODY,
    htmlBody: HTML_BODY,
    touch1EvidenceSlot: 'render-comparison',
    previewId: randomUUID(),
    previewUrl: 'https://www.odysseusaudit.com/apercu/token',
    prescanVersion: 'v3',
    evidenceVersion: 'v2',
    outreachPromptVersion: 'v1',
    providerDraftId: 'draft-1',
    providerMessageId: 'message-1',
    providerThreadId: 'thread-1',
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('outreach drafts', () => {
  beforeEach(async () => {
    if (connection) await createOutreachDraftModel(connection).deleteMany({});
  });

  it('records a created draft with a 90 day retention', async () => {
    if (!connection) return;
    const draft = await recordOutreachDraft(connection, input());

    expect(draft.status).toBe('created');
    // Declared on the schema, or Mongoose would silently strip it on save.
    const stored = await createOutreachDraftModel(connection)
      .findOne({ draftId: draft.draftId })
      .lean();
    expect(stored?.htmlBody).toBe(HTML_BODY);
    expect(draft.expiresAt.getTime() - CREATED_AT.getTime()).toBe(
      OUTREACH_DRAFT_RETENTION_DAYS * DAY_MS,
    );
  });

  it('stores hashes beside the text so touches stay comparable after the TTL', async () => {
    if (!connection) return;
    const draft = await recordOutreachDraft(connection, input());
    expect(draft.bodyHash).toBe(createHash('sha256').update(BODY, 'utf8').digest('hex'));
    expect(draft.body).toBe(BODY);
  });

  it('stores the touch-1 evidence slot used by the campaign opener', async () => {
    if (!connection) return;
    const draft = await recordOutreachDraft(connection, input());
    const stored = await findOutreachDraftById(connection, draft.draftId);
    expect(stored?.touch1EvidenceSlot).toBe('render-comparison');
  });

  it('refuses a second live draft for the same thread and touch', async () => {
    if (!connection) return;
    const first = input({ threadId: 'thread-a', touch: 1 });
    await recordOutreachDraft(connection, first);

    await expect(
      recordOutreachDraft(connection, input({ threadId: 'thread-a', touch: 1 })),
    ).rejects.toBeInstanceOf(DuplicateLiveDraftError);
    expect(await createOutreachDraftModel(connection).countDocuments({})).toBe(1);
  });

  it('allows a different touch on the same thread', async () => {
    if (!connection) return;
    await recordOutreachDraft(connection, input({ threadId: 'thread-a', touch: 1 }));
    await expect(
      recordOutreachDraft(connection, input({ threadId: 'thread-a', touch: 2 })),
    ).resolves.toMatchObject({ status: 'created' });
  });

  it('allows a replacement once the first draft is deleted', async () => {
    if (!connection) return;
    const first = await recordOutreachDraft(connection, input({ threadId: 'thread-a', touch: 1 }));
    await markOutreachDraftDeleted(connection, first.draftId);

    // The partial index covers live drafts only, so rejecting a draft and
    // preparing another is the ordinary path rather than a schema fight.
    await expect(
      recordOutreachDraft(connection, input({ threadId: 'thread-a', touch: 1 })),
    ).resolves.toMatchObject({ status: 'created' });
    expect(await listOutreachDrafts(connection, { threadId: 'thread-a' })).toHaveLength(2);
  });

  it('deletes idempotently and reports whether anything changed', async () => {
    if (!connection) return;
    const draft = await recordOutreachDraft(connection, input());

    await expect(markOutreachDraftDeleted(connection, draft.draftId)).resolves.toEqual({
      changed: true,
    });
    await expect(markOutreachDraftDeleted(connection, draft.draftId)).resolves.toEqual({
      changed: false,
    });
    const stored = await findOutreachDraftById(connection, draft.draftId);
    expect(stored?.status).toBe('deleted');
    expect(stored?.deletedAt).toBeInstanceOf(Date);
  });

  it('stops returning a deleted draft as the live one', async () => {
    if (!connection) return;
    const draft = await recordOutreachDraft(connection, input({ threadId: 'thread-a', touch: 1 }));
    expect(await findLiveOutreachDraft(connection, 'thread-a', 1)).not.toBeNull();

    await markOutreachDraftDeleted(connection, draft.draftId);
    expect(await findLiveOutreachDraft(connection, 'thread-a', 1)).toBeNull();
  });

  it('records the approved review outcome with the same deleted transition (issue #96)', async () => {
    if (!connection) return;
    const draft = await recordOutreachDraft(connection, input());

    await expect(recordOutreachDraftReview(connection, draft.draftId, 'approved')).resolves.toEqual(
      { changed: true },
    );
    const stored = await findOutreachDraftById(connection, draft.draftId);
    expect(stored?.status).toBe('deleted');
    expect(stored?.reviewOutcome).toBe('approved');
    expect(stored?.reviewedAt).toBeInstanceOf(Date);
    // The Gmail draft itself is never touched by a review.
    expect(stored?.providerDraftId).toBe('draft-1');
  });

  it('records the skipped review outcome, distinct from approve (issue #96)', async () => {
    if (!connection) return;
    const draft = await recordOutreachDraft(connection, input());

    await expect(recordOutreachDraftReview(connection, draft.draftId, 'skipped')).resolves.toEqual({
      changed: true,
    });
    const stored = await findOutreachDraftById(connection, draft.draftId);
    expect(stored?.reviewOutcome).toBe('skipped');
  });

  it('keeps the first review outcome on a repeat review (issue #96)', async () => {
    if (!connection) return;
    const draft = await recordOutreachDraft(connection, input());
    await recordOutreachDraftReview(connection, draft.draftId, 'approved');

    await expect(recordOutreachDraftReview(connection, draft.draftId, 'skipped')).resolves.toEqual({
      changed: false,
    });
    const stored = await findOutreachDraftById(connection, draft.draftId);
    expect(stored?.reviewOutcome).toBe('approved');
  });

  it('does not review a draft that never reached the review flow', async () => {
    if (!connection) return;
    const failed = await recordFailedOutreachDraft(connection, {
      threadId: 'thread-a',
      candidateId: 'candidate-a',
      touch: 1,
      language: 'fr',
      roleAddress: 'direction@hotel-exemple.fr',
      prescanVersion: 'v3',
      evidenceVersion: 'v2',
      outreachPromptVersion: 'v1',
      failureReason: 'preview-expired',
      createdAt: CREATED_AT,
    });

    await expect(
      recordOutreachDraftReview(connection, failed.draftId, 'approved'),
    ).resolves.toEqual({ changed: false });
    const stored = await findOutreachDraftById(connection, failed.draftId);
    expect(stored?.status).toBe('failed');
    expect(stored?.reviewOutcome).toBeUndefined();
  });

  it('records a refusal with no draft text and a typed reason', async () => {
    if (!connection) return;
    const failed = await recordFailedOutreachDraft(connection, {
      threadId: 'thread-a',
      candidateId: 'candidate-a',
      touch: 1,
      language: 'fr',
      roleAddress: 'direction@hotel-exemple.fr',
      previewId: randomUUID(),
      previewUrl: 'https://www.odysseusaudit.com/apercu/token',
      prescanVersion: 'v3',
      evidenceVersion: 'v2',
      outreachPromptVersion: 'v1',
      failureReason: 'suppressed-before-provider',
      createdAt: CREATED_AT,
    });

    expect(failed.status).toBe('failed');
    expect(failed.failureReason).toBe('suppressed-before-provider');
    // A half-validated body must never reach the operator's review list.
    expect(failed.body).toBe('');
    expect(failed.subject).toBe('');
    expect(failed.providerDraftId).toBeUndefined();
  });

  it('does not let a failed attempt block a later live draft for the same touch', async () => {
    if (!connection) return;
    await recordFailedOutreachDraft(connection, {
      threadId: 'thread-a',
      candidateId: 'candidate-a',
      touch: 1,
      language: 'fr',
      roleAddress: 'direction@hotel-exemple.fr',
      previewId: randomUUID(),
      previewUrl: 'https://www.odysseusaudit.com/apercu/token',
      prescanVersion: 'v3',
      evidenceVersion: 'v2',
      outreachPromptVersion: 'v1',
      failureReason: 'preview-expired',
      createdAt: CREATED_AT,
    });

    await expect(
      recordOutreachDraft(connection, input({ threadId: 'thread-a', touch: 1 })),
    ).resolves.toMatchObject({ status: 'created' });
  });
});
