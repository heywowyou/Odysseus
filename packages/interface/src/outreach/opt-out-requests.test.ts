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
      previewUrl: 'https://odysseusaudit.com/apercu/test',
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
    // A revoked record keeps no working link.
    expect(previews[0]?.previewUrl).toBeUndefined();
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

  async function submit(address: string, token?: string): Promise<void> {
    const bucket = createInMemoryOptOutBucket();
    if (token !== undefined) {
      await storeOptOutLink(bucket, token, `contact@${address.slice(address.indexOf('@') + 1)}`);
    }
    await bucket.putJson(optOutRequestKey(), {
      address,
      ...(token === undefined ? {} : { token }),
      receivedAt: new Date().toISOString(),
    });
    const result = await processOptOutRequests({
      connection: connection!,
      bucket,
      publisher: createInMemoryPreviewPublisher(),
    });
    expect(result.applied).toBe(1);
  }

  it("keeps an anonymous opt-out for a known prospect's address to that address", async () => {
    const prospect = await createProspectHub(connection!, {
      sector: 'hotel',
      name: 'Anon Prospect',
      websites: [
        {
          url: 'https://anon-prospect.fr/',
          registrableDomain: 'anon-prospect.fr',
          kind: 'own',
          primary: true,
        },
      ],
      emails: [{ address: 'contact@anon-prospect.fr', origin: 'atout-france' }],
    });

    await submit('contact@anon-prospect.fr');

    expect((await getProspectHub(connection!, prospect.prospectId))?.status).toBe('opted-out');
    await expect(
      isSuppressed(connection!, 'anon-prospect.fr', 'contact@anon-prospect.fr'),
    ).resolves.toBe(true);
    await expect(isSuppressed(connection!, 'anon-prospect.fr')).resolves.toBe(false);
    await expect(
      isSuppressed(connection!, 'anon-prospect.fr', 'direction@anon-prospect.fr'),
    ).resolves.toBe(false);
  });

  it("never suppresses a free-mail provider when a prospect's contact uses it", async () => {
    await createProspectHub(connection!, {
      sector: 'gite',
      name: 'Gîte Freemail',
      websites: [
        {
          url: 'https://gite-freemail.fr/',
          registrableDomain: 'gite-freemail.fr',
          kind: 'own',
          primary: true,
        },
      ],
      emails: [{ address: 'gite.owner@gmail.com', origin: 'atout-france' }],
    });

    await submit('gite.owner@gmail.com', createOptOutLink('https://www.odysseusaudit.com').token);

    await expect(isSuppressed(connection!, 'gmail.com', 'another.person@gmail.com')).resolves.toBe(
      false,
    );
    await expect(isSuppressed(connection!, 'gmail.com', 'gite.owner@gmail.com')).resolves.toBe(
      true,
    );
  });

  it('suppresses only the address for an anonymous request, never the business domain', async () => {
    await submit('reservation@anonymous-target.fr');

    await expect(
      isSuppressed(connection!, 'anonymous-target.fr', 'reservation@anonymous-target.fr'),
    ).resolves.toBe(true);
    await expect(isSuppressed(connection!, 'anonymous-target.fr')).resolves.toBe(false);
  });

  it('suppresses only the address for a free-mail request, even through our link', async () => {
    await submit('owner@gmail.com', createOptOutLink('https://www.odysseusaudit.com').token);

    await expect(isSuppressed(connection!, 'gmail.com', 'owner@gmail.com')).resolves.toBe(true);
    await expect(isSuppressed(connection!, 'gmail.com', 'someone-else@gmail.com')).resolves.toBe(
      false,
    );
  });

  it('suppresses the domain when our link was issued to an address on that domain', async () => {
    await submit(
      'direction@linked-hotel.fr',
      createOptOutLink('https://www.odysseusaudit.com').token,
    );

    await expect(isSuppressed(connection!, 'linked-hotel.fr')).resolves.toBe(true);
  });

  it('keeps a link issued to one domain from widening a request for another', async () => {
    const bucket = createInMemoryOptOutBucket();
    const link = createOptOutLink('https://www.odysseusaudit.com');
    await storeOptOutLink(bucket, link.token, 'contact@issued-hotel.fr');
    await bucket.putJson(optOutRequestKey(), {
      address: 'someone@other-business.fr',
      token: link.token,
      receivedAt: new Date().toISOString(),
    });
    await processOptOutRequests({
      connection: connection!,
      bucket,
      publisher: createInMemoryPreviewPublisher(),
    });

    await expect(isSuppressed(connection!, 'other-business.fr')).resolves.toBe(false);
    await expect(
      isSuppressed(connection!, 'other-business.fr', 'someone@other-business.fr'),
    ).resolves.toBe(true);
  });
});
