import { afterAll, describe, expect, it } from 'vitest';
import {
  createProspect,
  findProspectByDomainAndSourceVersion,
  getProspect,
  listQualifiedProspects,
  type NewProspectInput,
} from './prospects.js';
import { createProspectModel } from './schemas/prospect.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

function baseInput(overrides: Partial<NewProspectInput> = {}): NewProspectInput {
  const now = new Date();
  return {
    domain: 'example.fr',
    siteUrl: 'https://example.fr/',
    siren: { value: '732829320', source: 'lcen-mentions-legales-fetch', retrievedAt: now },
    denomination: { value: 'Example SAS', source: 'sirene-stock:test', retrievedAt: now },
    naf: { value: '47.91A', source: 'sirene-stock:test', retrievedAt: now },
    trancheEffectifs: {
      value: { code: '12', label: '20 à 49 salariés' },
      source: 'sirene-stock:test',
      retrievedAt: now,
    },
    etatAdministratif: { value: 'A', source: 'sirene-stock:test', retrievedAt: now },
    qualification: { qualified: true, reasons: [], evaluatedAt: now },
    scanJobId: 'job-1',
    dataOrigin: {
      domainSource: 'afnic-fichier-a',
      domainListVersion: 'test-fingerprint',
      companyDataSource: 'sirene-stock',
      companyDataVersion: 'test-fingerprint',
      nafAllowlistVersion: '2026-08-16',
    },
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('prospects', () => {
  it('creates a prospect with a generated prospectId and a 90 day expiresAt', async () => {
    const prospect = await createProspect(connection!, baseInput());

    expect(prospect.prospectId).toBeTruthy();
    expect(prospect.domain).toBe('example.fr');
    const expectedExpiryMs = prospect.createdAt.getTime() + 90 * 24 * 60 * 60 * 1000;
    expect(prospect.expiresAt.getTime()).toBe(expectedExpiryMs);

    const fetched = await getProspect(connection!, prospect.prospectId);
    expect(fetched?.prospectId).toBe(prospect.prospectId);
  });

  it('inserts a new document per call rather than upserting by domain', async () => {
    const first = await createProspect(connection!, baseInput({ domain: 'insert-only.fr' }));
    const second = await createProspect(connection!, baseInput({ domain: 'insert-only.fr' }));
    expect(first.prospectId).not.toBe(second.prospectId);
  });

  it('findProspectByDomainAndSourceVersion matches the domain and file version pair only', async () => {
    await createProspect(connection!, baseInput({ domain: 'lookup.fr' }));
    await createProspect(
      connection!,
      baseInput({
        domain: 'lookup.fr',
        dataOrigin: { ...baseInput().dataOrigin, domainListVersion: 'older-fingerprint' },
      }),
    );

    const current = await findProspectByDomainAndSourceVersion(
      connection!,
      'lookup.fr',
      'test-fingerprint',
    );
    expect(current?.domain).toBe('lookup.fr');
    expect(current?.dataOrigin.domainListVersion).toBe('test-fingerprint');

    // A row of the same domain under a different AFNIC file version must
    // not suppress the lookup for the current version - and an
    // un-ingested domain matches nothing.
    expect(
      await findProspectByDomainAndSourceVersion(connection!, 'lookup.fr', 'other-fingerprint'),
    ).toBeNull();
    expect(
      await findProspectByDomainAndSourceVersion(
        connection!,
        'not-ingested.fr',
        'test-fingerprint',
      ),
    ).toBeNull();
  });

  it('stores contactAddress only when supplied', async () => {
    const withAddress = await createProspect(
      connection!,
      baseInput({
        domain: 'with-address.fr',
        contactAddress: {
          value: 'contact@with-address.fr',
          localPart: 'contact',
          domain: 'with-address.fr',
        },
      }),
    );
    expect(withAddress.contactAddress?.value).toBe('contact@with-address.fr');

    const withoutAddress = await createProspect(
      connection!,
      baseInput({ domain: 'without-address.fr' }),
    );
    expect(withoutAddress.contactAddress).toBeUndefined();
  });

  it('listQualifiedProspects returns only qualified prospects', async () => {
    await createProspect(
      connection!,
      baseInput({
        domain: 'not-qualified.fr',
        qualification: {
          qualified: false,
          reasons: ['no-qualifying-contact-address'],
          evaluatedAt: new Date(),
        },
      }),
    );
    const qualified = await listQualifiedProspects(connection!, 500);
    expect(qualified.every((p) => p.qualification.qualified)).toBe(true);
    expect(qualified.some((p) => p.domain === 'not-qualified.fr')).toBe(false);
  });

  it('has a TTL index on expiresAt with expireAfterSeconds: 0', async () => {
    const ProspectModel = createProspectModel(connection!);
    // Mongoose builds indexes in the background once the model compiles, so
    // asking the collection what it has can outrun the build and fail under
    // load on a machine that is otherwise fine. persist-audit.test.ts already
    // waits the same way.
    await ProspectModel.ensureIndexes();
    const indexes = await ProspectModel.collection.indexes();
    const ttlIndex = indexes.find((index) => index.key?.['expiresAt'] === 1);
    expect(ttlIndex).toBeDefined();
    expect(ttlIndex?.expireAfterSeconds).toBe(0);
  });
});
