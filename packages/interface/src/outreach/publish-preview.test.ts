import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  HOTEL_EVIDENCE_OBSERVATIONS,
  HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
  type HotelPrescanEvidence,
} from '@odysseus/core';
import { createInMemoryPreviewPublisher } from './in-memory-preview-publisher.js';
import {
  CURRENT_PREVIEW_CONTENT_VERSION,
  previewLinks,
  publishPreview,
  revokePreviewsForDomain,
  type LivePreviewRef,
  type OutreachPreviewStorePort,
  type PreviewPublicationRow,
  type RecordPreviewInput,
} from './publish-preview.js';
import { hashPreviewToken, isValidPreviewToken } from './preview-token.js';
import { logger } from '../logger.js';

const BASE_URL = 'https://www.odysseusaudit.com';
const NOW = new Date('2026-08-29T09:00:00.000Z');
/** A one-pixel PNG, written to a temporary prescan directory so
 *  `embedOutreachEvidenceAsset`'s real file read and hash check run. Held here
 *  rather than imported from `packages/report`'s own fixtures: that module is
 *  not part of the package's public surface, and reaching into another
 *  package's build output is the kind of coupling the workspace avoids. */
const PREVIEW_TEST_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PREVIEW_TEST_PNG_BASE64, 'base64');
const PNG_SHA = createHash('sha256').update(PNG).digest('hex');

const OBSERVATIONS = Object.values(HOTEL_EVIDENCE_OBSERVATIONS);

let prescanDir: string;

beforeEach(async () => {
  prescanDir = await mkdtemp(path.join(tmpdir(), 'odysseus-preview-'));
  await mkdir(path.join(prescanDir, 'evidence'), { recursive: true });
  await writeFile(path.join(prescanDir, 'evidence', `${PNG_SHA}.png`), PNG);
});

afterEach(async () => {
  await rm(prescanDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

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
      byteSize: PNG.byteLength,
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

/** `evidence` is handled apart from the other overrides: under
 *  `exactOptionalPropertyTypes` an explicit `evidence: undefined` and an absent
 *  key are different types, and "the prescan recorded no evidence at all" needs
 *  the absent one. */
function row(
  overrides: Omit<Partial<PreviewPublicationRow>, 'evidence'> & {
    evidence?: HotelPrescanEvidence | undefined;
  } = {},
): PreviewPublicationRow {
  const { evidence: evidenceOverride, ...rest } = overrides;
  const base = {
    candidateId: 'candidate-1',
    domain: 'hotel-exemple.fr',
    businessName: 'Hôtel Exemple',
    prescanId: 'prescan-1',
    prescanVersion: 'v3',
    artifactsDir: prescanDir,
    observedAt: new Date('2026-08-20T08:00:00.000Z'),
    prescanExpiresAt: new Date('2026-11-01T08:00:00.000Z'),
    ...rest,
  };
  if ('evidence' in overrides && evidenceOverride === undefined) return base;
  return { ...base, evidence: evidenceOverride ?? evidence() };
}

interface FakeStore extends OutreachPreviewStorePort {
  recorded: RecordPreviewInput[];
  revoked: { previewId: string; reason: string }[];
}

function fakeStore(
  options: {
    publicationRow?: PreviewPublicationRow | null;
    suppressed?: boolean;
    live?: LivePreviewRef[];
    onRecord?: () => void;
    /** Simulates an objection's suppression write landing between the publish
     *  path's own gate and the record: the store refuses and self-revokes. */
    recordRefusedSuppressed?: boolean;
  } = {},
): FakeStore {
  const recorded: RecordPreviewInput[] = [];
  const revoked: { previewId: string; reason: string }[] = [];
  const alreadyRevoked = new Set<string>();

  return {
    recorded,
    revoked,
    findPublicationRow: () =>
      Promise.resolve(options.publicationRow === undefined ? row() : options.publicationRow),
    isSuppressed: () => Promise.resolve(options.suppressed ?? false),
    recordPreview: (input) => {
      options.onRecord?.();
      recorded.push(input);
      if (options.recordRefusedSuppressed === true) return Promise.resolve({ recorded: false });
      return Promise.resolve({
        recorded: true,
        previewId: 'preview-1',
        publicExpiresAt: new Date(input.publishedAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      });
    },
    listLivePreviews: () => Promise.resolve(options.live ?? []),
    revokePreview: (previewId, reason) => {
      revoked.push({ previewId, reason });
      if (alreadyRevoked.has(previewId)) return Promise.resolve({ changed: false });
      alreadyRevoked.add(previewId);
      return Promise.resolve({ changed: true });
    },
  };
}

describe('publishPreview (retired v1 path, plan 037)', () => {
  it('refuses every publication with v1-retired, before any gate or write', async () => {
    const store = fakeStore();
    const publisher = createInMemoryPreviewPublisher();
    const put = vi.fn();
    publisher.put = put;

    const result = await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    expect(result).toEqual({ published: false, refusal: 'v1-retired' });
    // Nothing is read, written, or decided: the store port is never reached.
    expect(store.recorded).toEqual([]);
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses the dry run the same way: no plan can describe a retired document', async () => {
    const store = fakeStore();
    const result = await publishPreview({
      store,
      publisher: createInMemoryPreviewPublisher(),
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: true,
      now: NOW,
    });
    expect(result).toEqual({ published: false, refusal: 'v1-retired' });
    expect(store.recorded).toEqual([]);
  });
});

describe('revokePreviewsForDomain', () => {
  it('deletes the object before marking the record', async () => {
    const publisher = createInMemoryPreviewPublisher();
    await publisher.put({
      objectKey: 'previews/aaa.html',
      html: '<p>x</p>',
      publicExpiresAt: NOW,
    });
    const store = fakeStore({
      live: [{ previewId: 'preview-1', objectKey: 'previews/aaa.html', domain: 'hotel-a.fr' }],
    });

    const order: string[] = [];
    vi.spyOn(publisher, 'delete').mockImplementation(async (key) => {
      order.push('delete');
      await Promise.resolve();
      expect(key).toBe('previews/aaa.html');
    });
    const revokePreview = store.revokePreview.bind(store);
    store.revokePreview = (previewId, reason) => {
      order.push('mark');
      return revokePreview(previewId, reason);
    };

    const result = await revokePreviewsForDomain({
      store,
      publisher,
      domain: 'hotel-a.fr',
      reason: 'objection',
    });

    expect(result).toEqual({ revoked: 1, alreadyRevoked: 0 });
    expect(order).toEqual(['delete', 'mark']);
  });

  it('does not mark a record revoked when the object could not be deleted', async () => {
    const publisher = createInMemoryPreviewPublisher();
    vi.spyOn(publisher, 'delete').mockRejectedValue(new Error('provider unavailable'));
    const store = fakeStore({
      live: [{ previewId: 'preview-1', objectKey: 'previews/aaa.html', domain: 'hotel-a.fr' }],
    });

    await expect(
      revokePreviewsForDomain({ store, publisher, domain: 'hotel-a.fr', reason: 'objection' }),
    ).rejects.toThrow(/provider unavailable/u);
    // A record saying "revoked" while the link still serves is the one outcome
    // revocation must never produce.
    expect(store.revoked).toEqual([]);
  });

  it('reports an already-revoked preview separately rather than failing', async () => {
    const publisher = createInMemoryPreviewPublisher();
    const live: LivePreviewRef[] = [
      { previewId: 'preview-1', objectKey: 'previews/aaa.html', domain: 'hotel-a.fr' },
      { previewId: 'preview-1', objectKey: 'previews/aaa.html', domain: 'hotel-a.fr' },
    ];
    const store = fakeStore({ live });

    const result = await revokePreviewsForDomain({
      store,
      publisher,
      domain: 'hotel-a.fr',
      reason: 'objection',
    });

    expect(result).toEqual({ revoked: 1, alreadyRevoked: 1 });
  });

  it('is a no-op for a domain with nothing live', async () => {
    const publisher = createInMemoryPreviewPublisher();
    const store = fakeStore({ live: [] });
    await expect(
      revokePreviewsForDomain({ store, publisher, domain: 'hotel-a.fr', reason: 'objection' }),
    ).resolves.toEqual({ revoked: 0, alreadyRevoked: 0 });
  });
});
