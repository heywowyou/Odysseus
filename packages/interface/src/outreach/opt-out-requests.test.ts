import { afterAll, describe, expect, it } from 'vitest';
import {
  createProspectHub,
  getProspectHub,
  isSuppressed,
  listOutreachPreviews,
  recordOutreachPreview,
} from '@odysseus/store';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import {
  createInMemoryOptOutBucket,
  createOptOutLink,
  deriveOptOutLinkKey,
  optOutRequestKey,
  storeOptOutLink,
} from './opt-out-bucket.js';
import { isPlausibleOptOutAddress, processOptOutRequests } from './opt-out-requests.js';
import { createInMemoryPreviewPublisher } from './in-memory-preview-publisher.js';
import { hashPreviewToken } from './preview-token.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability(
  scopedMongoTestUri('opt_out_requests'),
);

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

describe('opt-out links', () => {
  it('builds a personal link and stores the address under the token hash', async () => {
    const bucket = createInMemoryOptOutBucket();
    const link = createOptOutLink('https://www.odysseusaudit.com/');
    expect(link.url).toBe(`https://www.odysseusaudit.com/desinscription?t=${link.token}`);
    await storeOptOutLink(bucket, link.token, 'contact@hotel.fr', new Date('2026-09-15T00:00:00Z'));
    const key = deriveOptOutLinkKey(hashPreviewToken(link.token));
    await expect(bucket.getJson(key)).resolves.toEqual({
      address: 'contact@hotel.fr',
      expiresAt: '2027-09-15T00:00:00.000Z',
    });
  });

  it('rejects implausible addresses', () => {
    expect(isPlausibleOptOutAddress('contact@hotel.fr')).toBe(true);
    expect(isPlausibleOptOutAddress('nope')).toBe(false);
    expect(isPlausibleOptOutAddress(42)).toBe(false);
  });
});

describe.skipIf(!mongoAvailable)('processing opt-out requests', () => {
  it('blacklists the address, opts the prospect out, revokes its preview and consumes the request', async () => {
    const prospect = await createProspectHub(connection!, {
      sector: 'hotel',
      name: 'Hôtel Opposition',
      websites: [
        {
          url: 'https://hotel-opposition.fr/',
          registrableDomain: 'hotel-opposition.fr',
          kind: 'own',
          primary: true,
        },
      ],
      emails: [{ address: 'Contact@Hotel-Opposition.fr', origin: 'atout-france' }],
    });
    const publisher = createInMemoryPreviewPublisher();
    const objectKey = `previews/${'b'.repeat(64)}.html`;
    await publisher.put({ objectKey, html: '<p>x</p>', publicExpiresAt: new Date('2099-01-01') });
    await recordOutreachPreview(connection!, {
      prospectId: prospect.prospectId,
      tokenHash: 'b'.repeat(64),
      objectKey,
      domain: 'hotel-opposition.fr',
      language: 'fr',
      previewContentVersion: 'test',
      publishedAt: new Date(),
      sourceKind: 'full-audit',
      auditId: 'audit-opt-out',
    });

    const bucket = createInMemoryOptOutBucket();
    const link = createOptOutLink('https://www.odysseusaudit.com');
    await storeOptOutLink(bucket, link.token, 'contact@hotel-opposition.fr');
    await bucket.putJson(optOutRequestKey(), {
      address: 'contact@hotel-opposition.fr',
      token: link.token,
      receivedAt: new Date().toISOString(),
    });
    await bucket.putJson(optOutRequestKey(), { address: 'garbage', receivedAt: 'x' });

    const result = await processOptOutRequests({ connection: connection!, bucket, publisher });

    expect(result).toEqual({ applied: 1, discarded: 1, failed: 0 });
    expect(bucket.keys()).toEqual([]);
    await expect(
      isSuppressed(connection!, 'unrelated.fr', 'contact@hotel-opposition.fr'),
    ).resolves.toBe(true);
    await expect(isSuppressed(connection!, 'hotel-opposition.fr')).resolves.toBe(true);
    expect((await getProspectHub(connection!, prospect.prospectId))?.status).toBe('opted-out');
    await expect(publisher.get(objectKey)).resolves.toBeNull();
    const previews = await listOutreachPreviews(connection!, { prospectId: prospect.prospectId });
    expect(previews.map((preview) => preview.status)).toEqual(['revoked']);
  });

  it('blacklists an address that matches no prospect', async () => {
    const bucket = createInMemoryOptOutBucket();
    await bucket.putJson(optOutRequestKey(), { address: 'someone@elsewhere.fr', receivedAt: '' });
    const result = await processOptOutRequests({
      connection: connection!,
      bucket,
      publisher: createInMemoryPreviewPublisher(),
    });
    expect(result.applied).toBe(1);
    await expect(isSuppressed(connection!, 'x.fr', 'someone@elsewhere.fr')).resolves.toBe(true);
  });
});
