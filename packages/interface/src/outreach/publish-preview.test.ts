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

function fakeStore(options: {
  publicationRow?: PreviewPublicationRow | null;
  suppressed?: boolean;
  live?: LivePreviewRef[];
  onRecord?: () => void;
  /** Simulates an objection's suppression write landing between the publish
   *  path's own gate and the record: the store refuses and self-revokes. */
  recordRefusedSuppressed?: boolean;
}): FakeStore {
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

describe('publishPreview', () => {
  it('publishes, returns a one-time URL, and stores only the hash', async () => {
    const store = fakeStore({});
    const publisher = createInMemoryPreviewPublisher();

    const result = await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    expect(result.published).toBe(true);
    const token = result.url?.slice(`${BASE_URL}/apercu/`.length) ?? '';
    expect(isValidPreviewToken(token)).toBe(true);
    expect(result.publicExpiresAt?.toISOString()).toBe('2026-09-28T09:00:00.000Z');

    const stored = store.recorded[0];
    expect(stored?.tokenHash).toBe(hashPreviewToken(token));
    expect(stored?.objectKey).toBe(`previews/${hashPreviewToken(token)}.html`);
    expect(stored?.previewContentVersion).toBe(CURRENT_PREVIEW_CONTENT_VERSION);
    // Nothing the store is handed may contain the raw token.
    expect(JSON.stringify(stored)).not.toContain(token);

    // The object is reachable only through the derived key, and is the document.
    const object = await publisher.get(stored?.objectKey ?? '');
    expect(object?.html).toContain('Hôtel Exemple');
    expect(object?.publicExpiresAt.toISOString()).toBe('2026-09-28T09:00:00.000Z');
  });

  it('publishes a document carrying the site links the preview contract requires', async () => {
    const store = fakeStore({});
    const publisher = createInMemoryPreviewPublisher();
    await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    const html = (await publisher.get(store.recorded[0]?.objectKey ?? ''))?.html ?? '';
    const links = previewLinks(BASE_URL);
    expect(html).toContain(links.privacy);
    expect(html).toContain(links.optOut);
    expect(html).toContain(links.offer);
  });

  it('quotes the registry facts when the Sirene join matched, and says so in the origins', async () => {
    const store = fakeStore({
      publicationRow: row({
        sirene: {
          denomination: 'HOTEL EXEMPLE SAS',
          effectifBandCode: '11',
          checkedAt: new Date('2026-08-10T00:00:00.000Z'),
          stockVersion: '2026-08',
        },
      }),
    });
    const publisher = createInMemoryPreviewPublisher();
    await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    const html = (await publisher.get(store.recorded[0]?.objectKey ?? ''))?.html ?? '';
    expect(html).toContain('HOTEL EXEMPLE SAS');
    expect(html).toContain('10 à 19 salariés');
  });

  it.each([
    ['suppressed', { suppressed: true }, 'suppressed'],
    ['unknown candidate', { publicationRow: null }, 'candidate-unknown'],
  ])('refuses to publish: %s', async (_name, options, refusal) => {
    const store = fakeStore(options);
    const publisher = createInMemoryPreviewPublisher();

    const result = await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    expect(result.published).toBe(false);
    expect(result.refusal).toBe(refusal);
    expect(publisher.keys()).toEqual([]);
    expect(store.recorded).toEqual([]);
  });

  it('refuses as suppressed and takes the object back down when the record lands after an objection', async () => {
    // The gate at the top of publishPreview passed, so this is the window the
    // store-level recheck exists for: an objection's suppression write landed
    // between it and the record, the store refused and self-revoked the row,
    // and the uploaded object must not outlive that row.
    const store = fakeStore({ recordRefusedSuppressed: true });
    const publisher = createInMemoryPreviewPublisher();

    const result = await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    expect(result.published).toBe(false);
    expect(result.refusal).toBe('suppressed');
    // The record was attempted, and the object it would have served is gone.
    expect(store.recorded).toHaveLength(1);
    expect(publisher.keys()).toEqual([]);
  });

  it.each([
    ['no evidence at all', row({ evidence: undefined }), 'evidence-incomplete'],
    [
      'evidence marked incomplete',
      row({ evidence: evidence({ status: 'incomplete' }) }),
      'evidence-incomplete',
    ],
    [
      'too few summaries',
      row({ evidence: evidence({ summaries: evidence().summaries.slice(0, 2) }) }),
      'evidence-incomplete',
    ],
    [
      'prescan past its own retention',
      row({ prescanExpiresAt: new Date('2026-08-01T00:00:00.000Z') }),
      'prescan-expired',
    ],
  ])('refuses to publish: %s', async (_name, publicationRow, refusal) => {
    const store = fakeStore({ publicationRow });
    const publisher = createInMemoryPreviewPublisher();

    const result = await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    expect(result.refusal).toBe(refusal);
    expect(publisher.keys()).toEqual([]);
  });

  it('plans without observing anything under dry run', async () => {
    const store = fakeStore({});
    const publisher = createInMemoryPreviewPublisher();

    const result = await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: true,
      now: NOW,
    });

    expect(result.published).toBe(false);
    expect(result.plan).toEqual({
      wouldPublish: true,
      domain: 'hotel-exemple.fr',
      language: 'fr',
      summaries: 3,
      images: 1,
    });
    expect(result.url).toBeUndefined();
    expect(publisher.keys()).toEqual([]);
    expect(store.recorded).toEqual([]);
  });

  it('publishes nothing when the object write fails', async () => {
    const store = fakeStore({});
    const publisher = createInMemoryPreviewPublisher();
    vi.spyOn(publisher, 'put').mockRejectedValue(new Error('provider unavailable'));

    await expect(
      publishPreview({
        store,
        publisher,
        publicBaseUrl: BASE_URL,
        candidateId: 'candidate-1',
        language: 'fr',
        dryRun: false,
        now: NOW,
      }),
    ).rejects.toThrow(/provider unavailable/u);
    expect(store.recorded).toEqual([]);
  });

  it('deletes the object when the metadata write fails, so no unreachable file is left', async () => {
    const store = fakeStore({
      onRecord: () => {
        throw new Error('mongo unavailable');
      },
    });
    const publisher = createInMemoryPreviewPublisher();

    await expect(
      publishPreview({
        store,
        publisher,
        publicBaseUrl: BASE_URL,
        candidateId: 'candidate-1',
        language: 'fr',
        dryRun: false,
        now: NOW,
      }),
    ).rejects.toThrow(/mongo unavailable/u);
    expect(publisher.keys()).toEqual([]);
  });

  it('still returns no URL when both the metadata write and the cleanup fail', async () => {
    const store = fakeStore({
      onRecord: () => {
        throw new Error('mongo unavailable');
      },
    });
    const publisher = createInMemoryPreviewPublisher();
    vi.spyOn(publisher, 'delete').mockRejectedValue(new Error('provider unavailable'));
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    // The original failure surfaces, not the cleanup's: the caller needs to know
    // why nothing was published, and no URL is returned either way.
    await expect(
      publishPreview({
        store,
        publisher,
        publicBaseUrl: BASE_URL,
        candidateId: 'candidate-1',
        language: 'fr',
        dryRun: false,
        now: NOW,
      }),
    ).rejects.toThrow(/mongo unavailable/u);

    // The orphan is named loudly enough to sweep by hand, and by identifier
    // only: a log line carrying the token would be a working URL in a log file,
    // and one carrying the document would be a hotel's evidence in it.
    expect(logged).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(logged.mock.calls[0]);
    expect(line).toContain('orphaned preview object');
    expect(line).toContain('candidate-1');
    expect(line).not.toContain('Hôtel Exemple');
    expect(line).not.toContain('<!doctype');
    expect(line).not.toMatch(/apercu/u);
  });

  it('gives every publication its own token and object', async () => {
    const store = fakeStore({});
    const publisher = createInMemoryPreviewPublisher();
    const options = {
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr' as const,
      dryRun: false,
      now: NOW,
    };

    const first = await publishPreview(options);
    const second = await publishPreview(options);

    expect(first.url).not.toBe(second.url);
    expect(publisher.keys()).toHaveLength(2);
    // Republishing is a new document, never an edit of the live one, so the
    // earlier link keeps working until it is revoked deliberately.
    expect(store.recorded).toHaveLength(2);
  });

  it('refuses an evidence record written under a superseded schema version', async () => {
    const store = fakeStore({
      publicationRow: row({
        evidence: {
          ...evidence(),
          schemaVersion: 1 as unknown as typeof HOTEL_PRESCAN_EVIDENCE_SCHEMA_VERSION,
        },
      }),
    });
    const publisher = createInMemoryPreviewPublisher();

    const result = await publishPreview({
      store,
      publisher,
      publicBaseUrl: BASE_URL,
      candidateId: 'candidate-1',
      language: 'fr',
      dryRun: false,
      now: NOW,
    });

    expect(result.refusal).toBe('evidence-schema-outdated');
  });

  it('publishes nothing when the screenshot on disk is not the one the prescan measured', async () => {
    await writeFile(path.join(prescanDir, 'evidence', `${PNG_SHA}.png`), Buffer.concat([PNG, PNG]));
    const store = fakeStore({});
    const publisher = createInMemoryPreviewPublisher();

    await expect(
      publishPreview({
        store,
        publisher,
        publicBaseUrl: BASE_URL,
        candidateId: 'candidate-1',
        language: 'fr',
        dryRun: false,
        now: NOW,
      }),
    ).rejects.toThrow(/bytes on disk/u);
    expect(publisher.keys()).toEqual([]);
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
