import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  type HotelContactAddressOrigin,
  type HotelPrescanEvidence,
} from '@odysseus/core';
import { createInMemoryMailboxDraftAdapter } from './in-memory-mailbox-draft-adapter.js';
import {
  createOutreachDraft,
  type OutreachContactFacts,
  type OutreachDraftStorePort,
  type OutreachPreviewPort,
} from './create-outreach-draft.js';

const PNG_SHA = createHash('sha256').update('png').digest('hex');
const OBSERVATIONS = Object.values(HOTEL_EVIDENCE_OBSERVATIONS);

function evidence(): HotelPrescanEvidence {
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
      altText: { fr: 'Capture de la page de réservation', en: 'Booking page screenshot' },
      selectionReason: 'booking-form-error',
    },
    summaries: [0, 1, 2].map((index) => ({
      observation: OBSERVATIONS[index] as { fr: string; en: string },
      severity: 'serious' as const,
      wcagCriteria: ['1.4.3'],
      pageRole: 'homepage' as const,
    })),
  };
}

function contact(address: string, addressOrigin?: HotelContactAddressOrigin): OutreachContactFacts {
  return {
    address,
    state: 'found',
    ...(addressOrigin === undefined ? {} : { addressOrigin }),
  };
}

function storeForContact(resolveContact: () => OutreachContactFacts): OutreachDraftStorePort {
  return {
    findDraftRow: () =>
      Promise.resolve({
        candidateId: 'candidate-manual',
        domain: 'hotel-exemple.fr',
        businessName: 'Hôtel Exemple',
        prescanId: 'prescan-1',
        prescanVersion: 'v3',
        prescanExpiresAt: new Date('2026-11-01T00:00:00.000Z'),
        evidence: evidence(),
        contact: resolveContact(),
      }),
    isSuppressed: vi.fn(() => Promise.resolve(false)),
    openThread: () => Promise.resolve({ threadId: 'thread-1', state: 'open', currentTouch: 0 }),
    findLiveDraft: () => Promise.resolve(null),
    recordDraft: () => Promise.resolve({ draftId: 'draft-1' }),
    recordFailure: () => Promise.resolve(),
    attachProviderThreadId: () => Promise.resolve(true),
    advanceTouch: () => Promise.resolve(),
    transition: () => Promise.resolve(true),
  };
}

function preview(): OutreachPreviewPort {
  return {
    resolvePublished: () =>
      Promise.resolve({
        previewId: 'preview-1',
        url: 'https://www.odysseusaudit.com/apercu/token-abc',
        publicExpiresAt: new Date('2026-10-01T00:00:00.000Z'),
        proofCardCategories: ['accessibility', 'seo', 'performance'],
      }),
  };
}

describe('manual contact drafting', () => {
  it('drafts the manual address with the approved direct-origin disclosure and both suppression gates', async () => {
    const address = 'owner@example.net';
    const store = storeForContact(() => contact(address, 'provided-directly'));
    const mailbox = createInMemoryMailboxDraftAdapter({
      senderAddress: 'contact@example-sending-domain.fr',
    });

    const result = await createOutreachDraft({
      store,
      mailbox,
      preview: preview(),
      publicBaseUrl: 'https://www.odysseusaudit.com',
      candidateId: 'candidate-manual',
      language: 'fr',
      dryRun: false,
      previewToken: 'token-abc',
      now: new Date('2026-09-13T03:00:00.000Z'),
    });

    expect(result.created).toBe(true);
    expect(mailbox.recorded()[0]?.to).toBe(address);
    expect(result.body).toContain('les coordonnées que vous nous avez communiquées');
    expect(result.body).not.toContain('source publique');
    expect(store.isSuppressed).toHaveBeenCalledTimes(2);
    expect(store.isSuppressed).toHaveBeenNthCalledWith(1, 'hotel-exemple.fr', address);
    expect(store.isSuppressed).toHaveBeenNthCalledWith(2, 'hotel-exemple.fr', address);
  });

  it('covers discovered → manual override → draft manual → delete override → draft exact discovered', async () => {
    const requestedDiscovered = contact('reception@hotel-exemple.fr');
    const newerDiscovered = contact('direction@hotel-exemple.fr');
    const manual = contact('owner@example.net', 'provided-directly');
    let effective = requestedDiscovered;
    const store = storeForContact(() => effective);
    const mailbox = createInMemoryMailboxDraftAdapter({
      senderAddress: 'contact@example-sending-domain.fr',
    });
    const baseOptions = {
      store,
      mailbox,
      preview: preview(),
      publicBaseUrl: 'https://www.odysseusaudit.com',
      candidateId: 'candidate-manual',
      language: 'fr' as const,
      dryRun: false,
      previewToken: 'token-abc',
      now: new Date('2026-09-13T03:00:00.000Z'),
    };

    // Applying the override changes only the effective contact. The newer
    // discovered version is deliberately present as a sentinel but never selected.
    expect(effective.address).toBe(requestedDiscovered.address);
    effective = manual;
    const manualDraft = await createOutreachDraft(baseOptions);
    expect(manualDraft.created).toBe(true);
    expect(mailbox.recorded()[0]?.to).toBe(manual.address);

    // Deleting the override restores the exact requested discovered version,
    // not the newest discovered row.
    effective = requestedDiscovered;
    const discoveredDraft = await createOutreachDraft({
      ...baseOptions,
      now: new Date('2026-09-13T03:01:00.000Z'),
    });
    expect(discoveredDraft.created).toBe(true);
    expect(mailbox.recorded()[1]?.to).toBe(requestedDiscovered.address);
    expect(mailbox.recorded().map((draft) => draft.to)).not.toContain(newerDiscovered.address);
    expect(discoveredDraft.body).not.toContain('les coordonnées que vous nous avez communiquées');
  });
});
