/**
 * Orchestration tests for milestone 9c plan 012 step 4.
 *
 * Mirrors `create-outreach-draft.test.ts`'s structure: organised around the
 * two suppression gates, since that is what both orchestrators exist to
 * guarantee, plus the touch-2/touch-3 differences the plan calls for (no
 * preview, no link, a recovered previous subject, evidence only on touch 2,
 * the deterministic facts block only on touch 3). No test reaches the live
 * model: `generateProse` is injected.
 */

import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  type HotelPrescanEvidence,
  type OutreachThreadState,
} from '@odysseus/core';
import {
  createFollowUpDraft,
  type CreateFollowUpDraftOptions,
  type CreateFollowUpDraftStorePort,
  type FollowUpDraftRow,
  type RecordFollowUpDraftFacts,
  type RecordFollowUpFailureFacts,
} from './create-follow-up-draft.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';

const OBSERVATIONS = Object.values(HOTEL_EVIDENCE_OBSERVATIONS);
const PNG_SHA = createHash('sha256').update('png').digest('hex');
const NOW = new Date('2026-08-30T09:00:00.000Z');

function evidence(overrides: Partial<HotelPrescanEvidence> = {}): HotelPrescanEvidence {
  return {
    schemaVersion: HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
    status: 'complete',
    renderComparison: { state: 'omitted', reason: 'no-material-render-gap' },
    specificFailure: {
      state: 'captured',
      ref: `evidence/${PNG_SHA}.png`,
      sha256: PNG_SHA,
      mimeType: 'image/png',
      byteSize: 3,
      width: 1,
      height: 1,
      pageRole: 'booking',
      factRef: 'fact-1',
      altText: { fr: 'Capture de la page de réservation', en: 'Capture of the booking page' },
      selectionReason: 'booking-form-error',
    },
    summaries: [0, 1, 2].map((index) => ({
      observation: OBSERVATIONS[index] as { fr: string; en: string },
      severity: 'serious' as const,
      wcagCriteria: ['1.4.3'],
      pageRole: 'homepage' as const,
    })),
    ...overrides,
  };
}

function row(
  overrides: Omit<Partial<FollowUpDraftRow>, 'evidence'> & {
    evidence?: HotelPrescanEvidence | undefined;
  } = {},
): FollowUpDraftRow {
  const { evidence: evidenceOverride, ...rest } = overrides;
  return {
    threadId: 'thread-1',
    candidateId: 'candidate-1',
    domain: 'hotel-exemple.fr',
    businessName: 'Hôtel Exemple',
    language: 'fr',
    roleAddress: 'direction@hotel-exemple.fr',
    state: 'e1-sent',
    prescanVersion: 'v3',
    prescanExpiresAt: new Date('2026-11-01T08:00:00.000Z'),
    ...rest,
    ...('evidence' in overrides ? { evidence: evidenceOverride } : { evidence: evidence() }),
  } as FollowUpDraftRow;
}

function touch2Prose(): { output: unknown; model: string; temperature: number } {
  return {
    output: {
      touch: 2,
      evidenceRef: 'e2',
      sentences: [
        "Je reviens vers vous au sujet d'un second point observé sur votre site.",
        'Souhaitez-vous que je vous en dise plus ?',
      ],
    },
    model: 'stub',
    temperature: 0,
  };
}

function touch3Prose(): { output: unknown; model: string; temperature: number } {
  return {
    output: { touch: 3, closing: 'Je reste à votre disposition avant de classer cet échange.' },
    model: 'stub',
    temperature: 0,
  };
}

interface RecordedTransition {
  threadId: string;
  from: readonly OutreachThreadState[];
  to: OutreachThreadState;
}

interface Harness {
  options: CreateFollowUpDraftOptions;
  store: CreateFollowUpDraftStorePort;
  recordedDrafts: RecordFollowUpDraftFacts[];
  recordedFailures: RecordFollowUpFailureFacts[];
  transitions: RecordedTransition[];
  mailbox: ReturnType<typeof createInMemoryMailboxDraftAdapter>;
  generate: ReturnType<typeof vi.fn>;
  suppressed: Set<string>;
}

function harness(
  overrides: {
    draftRow?: FollowUpDraftRow | null;
    previousSubject?: string | null;
    suppressAfterFirstCheck?: boolean;
    liveDraft?: boolean;
    recordThrows?: Error;
    dryRun?: boolean;
    prose?: { output: unknown; model: string; temperature: number };
  } = {},
): Harness {
  const recordedDrafts: RecordFollowUpDraftFacts[] = [];
  const recordedFailures: RecordFollowUpFailureFacts[] = [];
  const transitions: RecordedTransition[] = [];
  const suppressed = new Set<string>();
  const mailbox = createInMemoryMailboxDraftAdapter({
    senderAddress: 'contact@example-sending-domain.fr',
  });
  const generate = vi.fn().mockResolvedValue(overrides.prose ?? touch2Prose());
  let suppressionChecks = 0;

  const store: CreateFollowUpDraftStorePort = {
    findFollowUpRow: () =>
      Promise.resolve(overrides.draftRow === undefined ? row() : overrides.draftRow),
    isSuppressed: (domain) => {
      suppressionChecks += 1;
      if (overrides.suppressAfterFirstCheck === true && suppressionChecks > 1) {
        return Promise.resolve(true);
      }
      return Promise.resolve(suppressed.has(domain));
    },
    findPreviousDraft: () =>
      Promise.resolve(
        overrides.previousSubject === null
          ? null
          : { subject: overrides.previousSubject ?? 'Votre site et vos réservations' },
      ),
    findLiveDraft: () =>
      Promise.resolve(overrides.liveDraft === true ? { draftId: 'existing' } : null),
    recordDraft: (facts) => {
      if (overrides.recordThrows !== undefined) return Promise.reject(overrides.recordThrows);
      recordedDrafts.push(facts);
      return Promise.resolve({ draftId: 'draft-2' });
    },
    recordFailure: (facts) => {
      recordedFailures.push(facts);
      return Promise.resolve();
    },
    advanceTouch: () => Promise.resolve(),
    transition: (input) => {
      transitions.push({ threadId: input.threadId, from: input.from, to: input.to });
      return Promise.resolve(true);
    },
  };

  return {
    options: {
      store,
      mailbox,
      threadId: 'thread-1',
      dryRun: overrides.dryRun ?? false,
      now: NOW,
      generateProse: generate as unknown as CreateFollowUpDraftOptions['generateProse'],
    },
    store,
    recordedDrafts,
    recordedFailures,
    transitions,
    mailbox,
    generate,
    suppressed,
  } as Harness;
}

describe('createFollowUpDraft, touch 2 happy path', () => {
  it('creates one provider draft and records it, with no preview and no link', async () => {
    const h = harness();
    const result = await createFollowUpDraft(h.options);

    expect(result.created).toBe(true);
    expect(result.touch).toBe(2);
    expect(h.mailbox.recorded()).toHaveLength(1);
    expect(h.recordedDrafts).toHaveLength(1);
    expect(result.body).not.toMatch(/https?:\/\//u);
  });

  it('produces one idempotent Re: subject from the touch-1 draft row', async () => {
    const h = harness();
    const result = await createFollowUpDraft(h.options);
    expect(result.subject).toBe('Re: Votre site et vos réservations');
  });

  it('does not double-prefix a previous subject already carrying Re:', async () => {
    const h = harness({ previousSubject: 'Re: Votre site et vos réservations' });
    const result = await createFollowUpDraft(h.options);
    expect(result.subject).toBe('Re: Votre site et vos réservations');
  });

  it('moves the thread from e1-sent to e2-drafted once recorded', async () => {
    const h = harness();
    await createFollowUpDraft(h.options);
    expect(h.transitions).toEqual([{ threadId: 'thread-1', from: ['e1-sent'], to: 'e2-drafted' }]);
  });
});

describe('createFollowUpDraft, touch 3 happy path', () => {
  it('creates a draft with no evidence and the deterministic facts block, no evidence-completeness gate applied', async () => {
    const h = harness({
      draftRow: row({ state: 'e2-sent', evidence: undefined }),
      prose: touch3Prose(),
    });
    const result = await createFollowUpDraft(h.options);

    expect(result.created).toBe(true);
    expect(result.touch).toBe(3);
    expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({ touch: 3 }), undefined);
  });

  it('moves the thread from e2-sent to e3-drafted once recorded', async () => {
    const h = harness({ draftRow: row({ state: 'e2-sent' }), prose: touch3Prose() });
    await createFollowUpDraft(h.options);
    expect(h.transitions).toEqual([{ threadId: 'thread-1', from: ['e2-sent'], to: 'e3-drafted' }]);
  });
});

describe('createFollowUpDraft, the two suppression gates', () => {
  it('makes no model call when suppressed before generation', async () => {
    const h = harness();
    h.suppressed.add('hotel-exemple.fr');

    const result = await createFollowUpDraft(h.options);

    expect(result.refusal).toBe('suppressed-before-generation');
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.mailbox.recorded()).toHaveLength(0);
  });

  it('creates no provider draft when suppression arrives mid-run', async () => {
    const h = harness({ suppressAfterFirstCheck: true });

    const result = await createFollowUpDraft(h.options);

    expect(result.refusal).toBe('suppressed-before-provider');
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.mailbox.recorded()).toHaveLength(0);
    expect(h.recordedFailures[0]?.failureReason).toBe('suppressed-before-provider');
  });

  it('checks suppression twice on a successful run', async () => {
    const h = harness();
    const isSuppressed = vi.spyOn(h.store, 'isSuppressed');
    await createFollowUpDraft(h.options);
    expect(isSuppressed).toHaveBeenCalledTimes(2);
  });
});

describe('createFollowUpDraft, refusals before anything is spent', () => {
  it('refuses an unknown thread', async () => {
    const h = harness({ draftRow: null });
    await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({
      refusal: 'thread-unknown',
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it.each<OutreachThreadState>(['open', 'e1-drafted', 'replied', 'bounced', 'closed'])(
    'refuses a thread in state %s as not eligible',
    async (state) => {
      const h = harness({ draftRow: row({ state }) });
      await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({
        refusal: 'thread-not-eligible',
      });
      expect(h.generate).not.toHaveBeenCalled();
    },
  );

  it('refuses a second live draft for the same touch', async () => {
    const h = harness({ liveDraft: true });
    await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({
      refusal: 'draft-already-live',
    });
    expect(h.mailbox.recorded()).toHaveLength(0);
  });

  it('refuses when the previous touch has no recoverable draft row', async () => {
    const h = harness({ previousSubject: null });
    await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({
      refusal: 'previous-draft-missing',
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('refuses incomplete evidence on touch 2', async () => {
    const h = harness({
      draftRow: row({
        evidence: evidence({ status: 'incomplete' } as Partial<HotelPrescanEvidence>),
      }),
    });
    await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({
      refusal: 'evidence-incomplete',
    });
  });

  it('refuses a prescan past its own retention on touch 2', async () => {
    const h = harness({
      draftRow: row({ prescanExpiresAt: new Date('2026-08-01T00:00:00.000Z') }),
    });
    await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({
      refusal: 'prescan-expired',
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('does not gate touch 3 on evidence at all, even when evidence is absent', async () => {
    const h = harness({
      draftRow: row({ state: 'e2-sent', evidence: undefined }),
      prose: touch3Prose(),
    });
    const result = await createFollowUpDraft(h.options);
    expect(result.created).toBe(true);
  });
});

describe('createFollowUpDraft, partial provider success', () => {
  it('withdraws the provider draft when it cannot be recorded', async () => {
    const h = harness({ recordThrows: new Error('duplicate live draft') });

    const result = await createFollowUpDraft(h.options);

    expect(result.refusal).toBe('provider-draft-unrecorded');
    await expect(h.mailbox.getDraft('draft-0001')).resolves.toBeNull();
    expect(h.recordedFailures[0]?.failureReason).toBe('provider-draft-unrecorded');
  });
});

describe('createFollowUpDraft, dry run', () => {
  it('observes nothing: no model call, no draft', async () => {
    const h = harness({ dryRun: true });

    const result = await createFollowUpDraft(h.options);

    expect(result.created).toBe(false);
    expect(result.plan).toMatchObject({
      wouldDraft: true,
      domain: 'hotel-exemple.fr',
      roleAddress: 'direction@hotel-exemple.fr',
      language: 'fr',
      touch: 2,
    });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.mailbox.recorded()).toHaveLength(0);
  });

  it('still refuses a suppressed domain in dry run', async () => {
    const h = harness({ dryRun: true });
    h.suppressed.add('hotel-exemple.fr');
    await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({
      refusal: 'suppressed-before-generation',
    });
  });
});
