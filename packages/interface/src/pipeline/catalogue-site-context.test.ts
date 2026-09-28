import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { probeMongoAvailability, scopedMongoTestUri } from '@odysseus/store/test-support.js';
import { catalogueContextOption } from './catalogue-site-context.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('catalogue_site_context'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

beforeEach(async () => {
  if (available) await connection!.dropDatabase();
});

async function auditFor(prospectId?: string): Promise<string> {
  const auditId = randomUUID();
  await connection!.db!.collection('audits').insertOne({
    auditId,
    siteUrl: 'https://hotel-du-port.example/',
    kind: 'audit',
    startedAt: new Date(),
    ...(prospectId !== undefined ? { prospectId } : {}),
  });
  return auditId;
}

async function directoryEntry(prospectId: string, extra: Record<string, unknown>) {
  await connection!.db!.collection('directory_entries').insertOne({
    directoryId: `atout-france:${randomUUID()}`,
    sector: 'hotel',
    name: 'Hôtel du Port',
    websiteKind: 'own',
    sourceRefs: [],
    prospectId,
    rooms: 42,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  });
}

describe.skipIf(!available)('catalogueContextOption (issue #559)', () => {
  it('gives the writing pass the catalogue type, rating and city of the audit prospect', async () => {
    const prospectId = randomUUID();
    await directoryEntry(prospectId, { stars: 4, commune: 'SAINT-JEAN-DE-LUZ' });

    const option = await catalogueContextOption(connection!, await auditFor(prospectId));

    expect(option).toEqual({
      catalogueContext: {
        propertyType: 'Hôtel (quatre étoiles)',
        sector: 'hospitality',
        city: 'Saint-Jean-de-Luz',
      },
    });
    // Trade-off 63: the room count never reaches the model.
    expect(JSON.stringify(option)).not.toContain('42');
  });

  it('adds nothing for an audit with no prospect or a prospect not in the catalogue', async () => {
    expect(await catalogueContextOption(connection!, await auditFor())).toEqual({});
    expect(await catalogueContextOption(connection!, await auditFor(randomUUID()))).toEqual({});
  });
});
