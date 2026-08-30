import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  findOutreachPreviewByTokenHash,
  getOutreachPreview,
  listLivePreviewsForDomain,
  listOutreachPreviews,
  PREVIEW_PUBLIC_LIFETIME_DAYS,
  PREVIEW_RETENTION_DAYS,
  recordOutreachPreview,
  revokeOutreachPreview,
  type RecordOutreachPreviewInput,
} from './outreach-previews.js';
import { addSuppressionEntry } from './suppression.js';
import { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
import { createSuppressionModel } from './schemas/suppression.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLISHED_AT = new Date('2026-08-29T09:00:00.000Z');

function token(): string {
  return randomBytes(32).toString('base64url');
}

function hashOf(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function input(overrides: Partial<RecordOutreachPreviewInput> = {}): RecordOutreachPreviewInput {
  const tokenHash = overrides.tokenHash ?? hashOf(token());
  return {
    tokenHash,
    objectKey: `previews/${tokenHash}.html`,
    candidateId: randomUUID(),
    prescanId: randomUUID(),
    domain: 'hotel-exemple.fr',
    language: 'fr',
    prescanVersion: 'v3',
    evidenceVersion: 'v2',
    previewContentVersion: 'v1',
    publishedAt: PUBLISHED_AT,
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('outreach previews', () => {
  beforeEach(async () => {
    if (!connection) return;
    await createOutreachPreviewModel(connection).deleteMany({});
    await createSuppressionModel(connection).deleteMany({});
  });

  /** Unwraps the accepted outcome. The refusal path is exercised directly by
   *  the suppression test below. */
  async function recordLivePreview(overrides: Partial<RecordOutreachPreviewInput> = {}) {
    if (!connection) throw new Error('mongo unavailable');
    const outcome = await recordOutreachPreview(connection, input(overrides));
    if (outcome.outcome !== 'recorded') throw new Error('expected the record to be accepted');
    return outcome;
  }

  it('records a preview live, with a 30 day public and 90 day private expiry', async () => {
    if (!connection) return;
    const recorded = await recordLivePreview();

    expect(recorded.publicExpiresAt.getTime() - PUBLISHED_AT.getTime()).toBe(
      PREVIEW_PUBLIC_LIFETIME_DAYS * DAY_MS,
    );
    expect(recorded.expiresAt.getTime() - PUBLISHED_AT.getTime()).toBe(
      PREVIEW_RETENTION_DAYS * DAY_MS,
    );
    // The private record must outlive the public document, or handling an
    // objection about an expired preview would have nothing to act on.
    expect(recorded.expiresAt.getTime()).toBeGreaterThan(recorded.publicExpiresAt.getTime());

    const stored = await getOutreachPreview(connection, recorded.previewId);
    expect(stored?.status).toBe('live');
    expect(stored?.revokedAt).toBeUndefined();
  });

  it('stores no raw token anywhere in the document', async () => {
    if (!connection) return;
    const raw = token();
    const recorded = await recordLivePreview({ tokenHash: hashOf(raw) });

    const stored = await getOutreachPreview(connection, recorded.previewId);
    expect(stored).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain(raw);
    expect(stored?.tokenHash).toBe(hashOf(raw));
    expect(stored?.objectKey).toBe(`previews/${hashOf(raw)}.html`);
  });

  it('refuses two previews sharing one token hash', async () => {
    if (!connection) return;
    const tokenHash = hashOf(token());
    await recordOutreachPreview(connection, input({ tokenHash }));
    await expect(recordOutreachPreview(connection, input({ tokenHash }))).rejects.toThrow();
  });

  it('refuses and self-revokes a record that lands once the domain is suppressed', async () => {
    if (!connection) return;
    await addSuppressionEntry(connection, {
      domain: 'hotel-a.fr',
      reasonCode: 'objection',
      reason: 'objection received',
    });

    const outcome = await recordOutreachPreview(connection, input({ domain: 'hotel-a.fr' }));
    expect(outcome.outcome).toBe('refused-suppressed');

    // The refusal is not a quiet leak: the row the insert created must end
    // revoked, or a publication losing this race would leave a working link
    // on a domain that has objected.
    if (outcome.outcome !== 'refused-suppressed') return;
    const stored = await getOutreachPreview(connection, outcome.previewId);
    expect(stored?.status).toBe('revoked');
    expect(stored?.revokedReason).toBe('domain-suppressed');
    await expect(listLivePreviewsForDomain(connection, 'hotel-a.fr')).resolves.toEqual([]);
  });

  it('resolves a preview by token hash for private tooling', async () => {
    if (!connection) return;
    const raw = token();
    const recorded = await recordLivePreview({ tokenHash: hashOf(raw) });

    const found = await findOutreachPreviewByTokenHash(connection, hashOf(raw));
    expect(found?.previewId).toBe(recorded.previewId);
    await expect(findOutreachPreviewByTokenHash(connection, hashOf(token()))).resolves.toBeNull();
  });

  it('revokes once and treats a second revoke as a no-op', async () => {
    if (!connection) return;
    const recorded = await recordLivePreview();

    const first = await revokeOutreachPreview(connection, recorded.previewId, 'objection');
    expect(first.changed).toBe(true);
    expect(first.preview?.status).toBe('revoked');
    expect(first.preview?.revokedReason).toBe('objection');
    const revokedAt = first.preview?.revokedAt;
    expect(revokedAt).toBeInstanceOf(Date);

    const second = await revokeOutreachPreview(connection, recorded.previewId, 'objection again');
    expect(second.changed).toBe(false);
    expect(second.preview?.status).toBe('revoked');
    // The first revocation's timestamp and reason stand: a retry must not
    // rewrite when the objection was actually acted on.
    expect(second.preview?.revokedAt?.toISOString()).toBe(revokedAt?.toISOString());
    expect(second.preview?.revokedReason).toBe('objection');
  });

  it('reports an unknown preview as unchanged rather than throwing', async () => {
    if (!connection) return;
    const result = await revokeOutreachPreview(connection, randomUUID(), 'objection');
    expect(result.changed).toBe(false);
    expect(result.preview).toBeNull();
  });

  it('lists only the live previews for a domain, which is what an objection acts on', async () => {
    if (!connection) return;
    const live = await recordLivePreview({ domain: 'hotel-a.fr' });
    const revoked = await recordLivePreview({ domain: 'hotel-a.fr' });
    await recordLivePreview({ domain: 'hotel-b.fr' });
    await revokeOutreachPreview(connection, revoked.previewId, 'objection');

    const rows = await listLivePreviewsForDomain(connection, 'hotel-a.fr');
    expect(rows.map((row) => row.previewId)).toEqual([live.previewId]);
  });

  it('canonicalizes the objection domain the same way suppression does', async () => {
    if (!connection) return;
    const live = await recordLivePreview({ domain: 'hotel-a.fr' });

    // An objection can arrive as whatever the hotel or their agency copied
    // out of an email. Each of these must land on the same record the bare
    // domain reaches, or the command would report `suppressed: true` while
    // the link stayed served.
    for (const spelling of [
      'https://www.hotel-a.fr/',
      'WWW.HOTEL-A.FR',
      'www.hotel-a.fr/chambres',
      'hotel-a.fr.',
    ]) {
      const rows = await listLivePreviewsForDomain(connection, spelling);
      expect(
        rows.map((row) => row.previewId),
        spelling,
      ).toEqual([live.previewId]);
    }
  });

  it('filters and orders the operator listing newest first', async () => {
    if (!connection) return;
    const older = await recordLivePreview({
      domain: 'hotel-a.fr',
      publishedAt: new Date('2026-08-01T09:00:00.000Z'),
    });
    const newer = await recordLivePreview({
      domain: 'hotel-a.fr',
      publishedAt: new Date('2026-08-20T09:00:00.000Z'),
    });
    await recordLivePreview({ domain: 'hotel-b.fr' });

    const rows = await listOutreachPreviews(connection, { domain: 'hotel-a.fr' });
    expect(rows.map((row) => row.previewId)).toEqual([newer.previewId, older.previewId]);

    const limited = await listOutreachPreviews(connection, { domain: 'hotel-a.fr', limit: 1 });
    expect(limited).toHaveLength(1);

    const liveOnly = await listOutreachPreviews(connection, { status: 'live' });
    expect(liveOnly).toHaveLength(3);
  });

  it('carries a TTL index on expiresAt rather than on createdAt', async () => {
    if (!connection) return;
    const model = createOutreachPreviewModel(connection);
    await model.init();
    const indexes = await model.collection.indexes();
    const ttl = indexes.filter((index) => index['expireAfterSeconds'] !== undefined);
    expect(ttl).toHaveLength(1);
    expect(ttl[0]?.['key']).toEqual({ expiresAt: 1 });
    expect(ttl[0]?.['expireAfterSeconds']).toBe(0);
  });
});
