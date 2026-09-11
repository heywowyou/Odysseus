/**
 * Orchestration tests for milestone 9c plan 012 step 4, reworked by
 * trade-off 83.
 *
 * Mirrors `create-outreach-draft.test.ts`'s structure: organised around the
 * two suppression gates, since that is what both orchestrators exist to
 * guarantee, plus the touch-2/touch-3 differences: no preview, no link, a
 * recovered previous subject, and the deterministic facts block only on touch
 * 3. No model is involved: both follow-ups are approved templates.
 */

import { describe, expect, it, vi } from 'vitest';
import type { HotelPrescanEvidence, OutreachThreadState } from '@odysseus/core';
import {
  createFollowUpDraft,
  type CreateFollowUpDraftOptions,
  type CreateFollowUpDraftStorePort,
  type FollowUpDraftRow,
  type RecordFollowUpDraftFacts,
  type RecordFollowUpFailureFacts,
} from './create-follow-up-draft.js';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';

const NOW = new Date('2026-08-30T09:00:00.000Z');

function row(
  overrides: Omit<Partial<FollowUpDraftRow>, 'evidence'> & {
    evidence?: HotelPrescanEvidence | undefined;
  } = {},
): FollowUpDraftRow {
  return {
    threadId: 'thread-1',
    candidateId: 'candidate-1',
    domain: 'hotel-exemple.fr',
    businessName: 'HÔTEL DES TILLEULS',
    language: 'fr',
    roleAddress: 'direction@hotel-exemple.fr',
    state: 'e1-sent',
    prescanVersion: 'v3',
    prescanExpiresAt: new Date('2026-11-01T08:00:00.000Z'),
    ...overrides,
  } as FollowUpDraftRow;
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
  } = {},
): Harness {
  const recordedDrafts: RecordFollowUpDraftFacts[] = [];
  const recordedFailures: RecordFollowUpFailureFacts[] = [];
  const transitions: RecordedTransition[] = [];
  const suppressed = new Set<string>();
  const mailbox = createInMemoryMailboxDraftAdapter({
    senderAddress: 'contact@example-sending-domain.fr',
  });
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
          : { subject: overrides.previousSubject ?? 'Hôtel des Tilleuls : accessibilité' },
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
    },
    store,
    recordedDrafts,
    recordedFailures,
    transitions,
    mailbox,
    suppressed,
  };
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

  it('writes the approved reminder for this hotel, naming no finding', async () => {
    const result = await createFollowUpDraft(harness().options);
    expect(result.body).toMatch(
      /Nous nous permettons de vous relancer au sujet de l'analyse du site de l'Hôtel des Tilleuls\.|Nous souhaitions nous assurer que notre précédent message vous était bien parvenu\./u,
    );
    expect(result.body).toContain("n'hésitez pas à répondre à cet e-mail");
  });

  it('produces one idempotent Re: subject from the touch-1 draft row', async () => {
    const result = await createFollowUpDraft(harness().options);
    expect(result.subject).toBe('Re: Hôtel des Tilleuls : accessibilité');
  });

  it('does not double-prefix a previous subject already carrying Re:', async () => {
    const h = harness({ previousSubject: 'Re: Hôtel des Tilleuls : accessibilité' });
    const result = await createFollowUpDraft(h.options);
    expect(result.subject).toBe('Re: Hôtel des Tilleuls : accessibilité');
  });

  it('is not gated on prescan evidence: a reminder needs no second observation', async () => {
    const h = harness({
      draftRow: row({ evidence: undefined, prescanExpiresAt: new Date('2026-08-01T00:00:00Z') }),
    });
    await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({ created: true });
  });

  it('records the template version, not a model prompt', async () => {
    const h = harness();
    await createFollowUpDraft(h.options);
    expect(h.recordedDrafts[0]?.outreachPromptVersion).toBe('template-v1');
  });

  it('moves the thread from e1-sent to e2-drafted once recorded', async () => {
    const h = harness();
    await createFollowUpDraft(h.options);
    expect(h.transitions).toEqual([{ threadId: 'thread-1', from: ['e1-sent'], to: 'e2-drafted' }]);
  });
});

describe('createFollowUpDraft, touch 3 happy path', () => {
  it('frames the deterministic facts block with the approved last-message sentences', async () => {
    const h = harness({ draftRow: row({ state: 'e2-sent' }) });
    const result = await createFollowUpDraft(h.options);

    expect(result.created).toBe(true);
    expect(result.touch).toBe(3);
    const body = result.body ?? '';
    const intro = body.indexOf(
      "Ce sera notre dernier message au sujet du site de l'Hôtel des Tilleuls.",
    );
    const facts = body.indexOf('Le cadre applicable, et ce que nous pouvons en dire');
    const closing = body.indexOf(
      'Nous restons à votre disposition si vous souhaitez recevoir le détail de notre analyse.',
    );
    expect(intro).toBeGreaterThanOrEqual(0);
    expect(facts).toBeGreaterThan(intro);
    expect(closing).toBeGreaterThan(facts);
  });

  it('moves the thread from e2-sent to e3-drafted once recorded', async () => {
    const h = harness({ draftRow: row({ state: 'e2-sent' }) });
    await createFollowUpDraft(h.options);
    expect(h.transitions).toEqual([{ threadId: 'thread-1', from: ['e2-sent'], to: 'e3-drafted' }]);
  });
});

describe('createFollowUpDraft, the two suppression gates', () => {
  it('creates nothing when suppressed at the start', async () => {
    const h = harness();
    h.suppressed.add('hotel-exemple.fr');

    const result = await createFollowUpDraft(h.options);

    expect(result.refusal).toBe('suppressed-before-generation');
    expect(h.mailbox.recorded()).toHaveLength(0);
    expect(h.recordedFailures).toHaveLength(0);
  });

  it('creates no provider draft when suppression arrives mid-run', async () => {
    const h = harness({ suppressAfterFirstCheck: true });

    const result = await createFollowUpDraft(h.options);

    expect(result.refusal).toBe('suppressed-before-provider');
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
    expect(h.mailbox.recorded()).toHaveLength(0);
  });

  it.each<OutreachThreadState>(['open', 'e1-drafted', 'replied', 'bounced', 'closed'])(
    'refuses a thread in state %s as not eligible',
    async (state) => {
      const h = harness({ draftRow: row({ state }) });
      await expect(createFollowUpDraft(h.options)).resolves.toMatchObject({
        refusal: 'thread-not-eligible',
      });
      expect(h.mailbox.recorded()).toHaveLength(0);
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
    expect(h.mailbox.recorded()).toHaveLength(0);
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
  it('observes nothing: no draft', async () => {
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
