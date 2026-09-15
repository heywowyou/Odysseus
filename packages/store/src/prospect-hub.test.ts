import { afterAll, describe, expect, it } from 'vitest';
import { departmentFromPostcodeForTest } from './prospect-hub.js';
import { createProspectHub, updateProspect } from './prospect-hub.js';
import { createProspectHubModel } from './schemas/prospect-hub.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

describe('prospect hub pure helpers', () => {
  it('derives metropolitan departments and Corsica from postcodes', () => {
    expect(departmentFromPostcodeForTest('92100')).toBe('92');
    expect(departmentFromPostcodeForTest('20000')).toBe('2A');
    expect(departmentFromPostcodeForTest('20200')).toBe('2B');
  });
});

describe.skipIf(!mongoAvailable)('prospect hub persistence', () => {
  it('updates a prospect without leaking Mongoose metadata into the strict domain object', async () => {
    const created = await createProspectHub(connection!, {
      sector: 'hotel',
      name: 'Metadata Fixture',
      websites: [
        {
          url: 'https://example.com/',
          registrableDomain: 'example.com',
          kind: 'own',
          primary: true,
        },
      ],
    });

    const updated = await updateProspect(connection!, created.prospectId, {
      notes: 'Edited locally',
    });

    expect(updated?.notes).toBe('Edited locally');
    expect(updated).not.toHaveProperty('_id');
    expect(updated).not.toHaveProperty('__v');
    expect(
      await createProspectHubModel(connection!).countDocuments({ prospectId: created.prospectId }),
    ).toBe(1);
  });
});
