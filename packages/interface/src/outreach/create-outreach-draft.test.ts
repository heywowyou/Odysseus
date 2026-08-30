/**
 * Orchestration tests for milestone 9c plan 011.
 *
 * The suite is organised around the two suppression gates, because that is
 * what the module exists to guarantee. Everything between them takes real
 * time, and an objection arriving in that window has to stop the draft in
 * flight. Each fault is injected at the exact point it would occur in
 * production rather than simulated by calling an internal.
 *
 * No test reaches the live model: `generateProse` is injected, matching the
 * LLM package's own stubbed-client discipline.
 */

import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  type HotelPrescanEvidence,
} from '@odysseus/core';
import {
  createOutreachDraft,
  type CreateOutreachDraftOptions,
  type OutreachDraftRow,
  type OutreachDraftStorePort,
  type OutreachPreviewPort,
  type RecordDraftFacts,
  type RecordFailureFacts,
} from './create-outreach-draft.js';
import type { OutreachThreadState } from '@odysseus/core';
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
  overrides: Omit<Partial<OutreachDraftRow>, 'evidence' | 'contact'> & {
    evidence?: HotelPrescanEvidence | undefined;
    contact?: { address: string; state: string } | undefined;
  } = {},
): OutreachDraftRow {
  const { evidence: evidenceOverride, contact: contactOverride, ...rest } = overrides;
  return {
    candidateId: 'candidate-1',
    domain: 'hotel-exemple.fr',
    businessName: 'Hôtel Exemple',
    prescanId: 'prescan-1',
    prescanVersion: 'v3',
    prescanExpiresAt: new Date('2026-11-01T08:00:00.000Z'),
    ...rest,
    ...('evidence' in overrides ? { evidence: evidenceOverride } : { evidence: evidence() }),
    ...('contact' in overrides
      ? { contact: contactOverride }
      : { contact: { address: 'direction@hotel-exemple.fr', state: 'found' } }),
  } as OutreachDraftRow;
}

/** Valid touch-1 prose, already past every guard, as `generateOutreachProse`
 *  would return it. */
function prose(): { output: unknown; model: string; temperature: number } {
  return {
    output: {
      touch: 1,
      subject: 'Votre site et vos réservations',
      opening: 'Je me permets de vous écrire au sujet de votre site.',
      evidenceSentence: 'Un point de votre parcours de réservation ne se termine pas correctement.',
      question: 'Souhaitez-vous que je vous montre ce que nous avons observé ?',
    },
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
  options: CreateOutreachDraftOptions;
  store: OutreachDraftStorePort;
  recordedDrafts: RecordDraftFacts[];
  recordedFailures: RecordFailureFacts[];
  transitions: RecordedTransition[];
  mailbox: ReturnType<typeof createInMemoryMailboxDraftAdapter>;
  generate: ReturnType<typeof vi.fn>;
  suppressed: Set<string>;
  publishCalls: number;
}

function harness(
  overrides: {
    draftRow?: OutreachDraftRow | null;
    suppressAfterFirstCheck?: boolean;
    threadState?: OutreachThreadState;
    liveDraft?: boolean;
    previewRefusal?: string;
    recordThrows?: Error;
    dryRun?: boolean;
  } = {},
): Harness {
  const recordedDrafts: RecordDraftFacts[] = [];
  const recordedFailures: RecordFailureFacts[] = [];
  const transitions: RecordedTransition[] = [];
  const suppressed = new Set<string>();
  const mailbox = createInMemoryMailboxDraftAdapter({
    senderAddress: 'contact@example-sending-domain.fr',
  });
  const generate = vi.fn().mockResolvedValue(prose());
  let suppressionChecks = 0;
  const state = { publishCalls: 0 };

  const store: OutreachDraftStorePort = {
    findDraftRow: () =>
      Promise.resolve(overrides.draftRow === undefined ? row() : overrides.draftRow),
    isSuppressed: (domain) => {
      suppressionChecks += 1;
      // The second gate is what an objection arriving mid-run exercises.
      if (overrides.suppressAfterFirstCheck === true && suppressionChecks > 1) {
        return Promise.resolve(true);
      }
      return Promise.resolve(suppressed.has(domain));
    },
    openThread: () =>
      Promise.resolve({
        threadId: 'thread-1',
        state: overrides.threadState ?? 'open',
        currentTouch: 0,
      }),
    findLiveDraft: () =>
      Promise.resolve(overrides.liveDraft === true ? { draftId: 'existing' } : null),
    recordDraft: (facts) => {
      if (overrides.recordThrows !== undefined) return Promise.reject(overrides.recordThrows);
      recordedDrafts.push(facts);
      return Promise.resolve({ draftId: 'draft-1' });
    },
    recordFailure: (facts) => {
      recordedFailures.push(facts);
      return Promise.resolve();
    },
    attachProviderThreadId: () => Promise.resolve(true),
    advanceTouch: () => Promise.resolve(),
    transition: (input) => {
      transitions.push({ threadId: input.threadId, from: input.from, to: input.to });
      return Promise.resolve(true);
    },
  };

  const preview: OutreachPreviewPort = {
    publish: () => {
      state.publishCalls += 1;
      if (overrides.previewRefusal !== undefined) {
        return Promise.resolve({ refusal: overrides.previewRefusal });
      }
      return Promise.resolve({
        previewId: 'preview-1',
        url: 'https://www.odysseusaudit.com/apercu/token-abc',
        publicExpiresAt: new Date('2026-09-29T09:00:00.000Z'),
      });
    },
  };

  return {
    options: {
      store,
      mailbox,
      preview,
      publicBaseUrl: 'https://www.odysseusaudit.com',
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: overrides.dryRun ?? false,
      now: NOW,
      generateProse: generate as unknown as CreateOutreachDraftOptions['generateProse'],
    },
    store,
    recordedDrafts,
    recordedFailures,
    transitions,
    mailbox,
    generate,
    suppressed,
    get publishCalls() {
      return state.publishCalls;
    },
  } as Harness;
}

describe('createOutreachDraft, happy path', () => {
  it('creates one provider draft and records it', async () => {
    const h = harness();
    const result = await createOutreachDraft(h.options);

    expect(result.created).toBe(true);
    expect(result.providerDraftId).toBeDefined();
    expect(h.mailbox.recorded()).toHaveLength(1);
    expect(h.recordedDrafts).toHaveLength(1);
    expect(h.recordedFailures).toHaveLength(0);
  });

  it('records which evidence slot opened touch 1', async () => {
    const h = harness();
    await createOutreachDraft(h.options);
    expect(h.recordedDrafts[0]?.touch1EvidenceSlot).toBe('specific-failure');
  });

  it('addresses the approved role contact and nobody else', async () => {
    const h = harness();
    await createOutreachDraft(h.options);
    expect(h.mailbox.recorded()[0]?.to).toBe('direction@hotel-exemple.fr');
  });

  it('sends plain text carrying exactly one link, the preview', async () => {
    const h = harness();
    const result = await createOutreachDraft(h.options);
    const body = result.body ?? '';

    const links = body.match(/https?:\/\/\S+/gu) ?? [];
    const previewLinksFound = links.filter((link) => link.includes('/apercu/'));
    expect(previewLinksFound).toHaveLength(1);
    expect(h.mailbox.recorded()[0]?.mime).toContain('Content-Type: text/plain');
    expect(h.mailbox.recorded()[0]?.mime).not.toContain('multipart');
  });

  it('discloses privacy and opt-out routes in the first touch', async () => {
    const h = harness();
    const result = await createOutreachDraft(h.options);
    expect(result.body).toContain('/confidentialite-prospection');
    expect(result.body).toContain('/desinscription');
  });

  it('declares the registry origin only when registry facts exist', async () => {
    const withoutRegistry = await createOutreachDraft(harness().options);
    // No `assessment` on the row, so no registry origin may be claimed.
    expect(withoutRegistry.body).not.toContain('registre');
  });

  it('moves the thread from open to e1-drafted once the draft is recorded', async () => {
    const h = harness();
    await createOutreachDraft(h.options);
    expect(h.transitions).toEqual([{ threadId: 'thread-1', from: ['open'], to: 'e1-drafted' }]);
  });
});

describe('createOutreachDraft, the two suppression gates', () => {
  it('makes no model call when suppressed before generation', async () => {
    const h = harness();
    h.suppressed.add('hotel-exemple.fr');

    const result = await createOutreachDraft(h.options);

    expect(result.refusal).toBe('suppressed-before-generation');
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.publishCalls).toBe(0);
    expect(h.mailbox.recorded()).toHaveLength(0);
  });

  it('creates no provider draft when suppression arrives mid-run', async () => {
    const h = harness({ suppressAfterFirstCheck: true });

    const result = await createOutreachDraft(h.options);

    expect(result.refusal).toBe('suppressed-before-provider');
    // The model ran and the preview was published; that is the cost of an
    // objection landing mid-run, and is why the second gate exists at all.
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.mailbox.recorded()).toHaveLength(0);
    expect(h.recordedFailures[0]?.failureReason).toBe('suppressed-before-provider');
  });

  it('checks suppression twice on a successful run', async () => {
    const h = harness();
    const isSuppressed = vi.spyOn(h.store, 'isSuppressed');
    await createOutreachDraft(h.options);
    expect(isSuppressed).toHaveBeenCalledTimes(2);
  });
});

describe('createOutreachDraft, refusals before anything is spent', () => {
  it('refuses an unknown candidate', async () => {
    const h = harness({ draftRow: null });
    await expect(createOutreachDraft(h.options)).resolves.toMatchObject({
      refusal: 'candidate-unknown',
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it.each([
    ['parked', { address: '', state: 'parked' }],
    ['rejected', { address: 'x@y.fr', state: 'rejected' }],
    ['absent', undefined],
  ])('refuses when the contact is %s', async (_label, contact) => {
    const h = harness({ draftRow: row({ contact }) });
    await expect(createOutreachDraft(h.options)).resolves.toMatchObject({
      refusal: 'no-usable-contact',
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('refuses incomplete evidence', async () => {
    const h = harness({
      draftRow: row({
        evidence: evidence({ status: 'incomplete' } as Partial<HotelPrescanEvidence>),
      }),
    });
    await expect(createOutreachDraft(h.options)).resolves.toMatchObject({
      refusal: 'evidence-incomplete',
    });
  });

  it('refuses a prescan past its own retention', async () => {
    const h = harness({
      draftRow: row({ prescanExpiresAt: new Date('2026-08-01T00:00:00.000Z') }),
    });
    await expect(createOutreachDraft(h.options)).resolves.toMatchObject({
      refusal: 'prescan-expired',
    });
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('refuses a second live draft for the same touch', async () => {
    const h = harness({ liveDraft: true });
    await expect(createOutreachDraft(h.options)).resolves.toMatchObject({
      refusal: 'draft-already-live',
    });
    expect(h.mailbox.recorded()).toHaveLength(0);
  });

  it('refuses a closed thread', async () => {
    const h = harness({ threadState: 'closed' });
    await expect(createOutreachDraft(h.options)).resolves.toMatchObject({
      refusal: 'thread-closed',
    });
    expect(h.mailbox.recorded()).toHaveLength(0);
  });

  it('refuses when the preview cannot be published', async () => {
    const h = harness({ previewRefusal: 'evidence-incomplete' });
    await expect(createOutreachDraft(h.options)).resolves.toMatchObject({
      refusal: 'preview-publication-failed',
    });
    // No link means no draft: a first touch with a dead preview URL is worse
    // than no message at all.
    expect(h.mailbox.recorded()).toHaveLength(0);
  });
});

describe('createOutreachDraft, partial provider success', () => {
  it('withdraws the provider draft when it cannot be recorded', async () => {
    const h = harness({ recordThrows: new Error('duplicate live draft') });

    const result = await createOutreachDraft(h.options);

    expect(result.refusal).toBe('provider-draft-unrecorded');
    // The draft reached Gmail and was then withdrawn: left in place it would
    // be an unreviewed message the operator could send with no record of what
    // produced it.
    await expect(h.mailbox.getDraft('draft-0001')).resolves.toBeNull();
    expect(h.recordedFailures[0]?.failureReason).toBe('provider-draft-unrecorded');
  });

  it('reports a provider failure without recording a draft', async () => {
    const h = harness();
    h.mailbox.failNextCreate(new Error('gmail 429'));
    await expect(createOutreachDraft(h.options)).rejects.toThrow(/gmail 429/);
    expect(h.recordedDrafts).toHaveLength(0);
  });
});

describe('createOutreachDraft, dry run', () => {
  it('observes nothing: no model call, no preview, no draft', async () => {
    const h = harness({ dryRun: true });

    const result = await createOutreachDraft(h.options);

    expect(result.created).toBe(false);
    expect(result.plan).toMatchObject({
      wouldDraft: true,
      domain: 'hotel-exemple.fr',
      roleAddress: 'direction@hotel-exemple.fr',
      touch: 1,
    });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.publishCalls).toBe(0);
    expect(h.mailbox.recorded()).toHaveLength(0);
  });

  it('still refuses a suppressed domain in dry run', async () => {
    const h = harness({ dryRun: true });
    h.suppressed.add('hotel-exemple.fr');
    await expect(createOutreachDraft(h.options)).resolves.toMatchObject({
      refusal: 'suppressed-before-generation',
    });
  });
});
