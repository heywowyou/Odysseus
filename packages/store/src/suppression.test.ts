import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  hashSuppressionValue,
  normalizeAddressForHash,
  normalizeDomainForHash,
} from '@odysseus/core';
import { createSuppressionModel } from './schemas/suppression.schema.js';
import { addSuppressionEntry, isSuppressed } from './suppression.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(scopedMongoTestUri('suppression'));

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

describe.skipIf(!available)('suppression idempotency', () => {
  const Suppression = () => createSuppressionModel(connection!);

  beforeEach(async () => {
    await Suppression().deleteMany({});
    await Suppression().syncIndexes();
  });

  it('builds the unique idempotency index', async () => {
    const indexes = await Suppression().listIndexes();
    const key = indexes.find((index) => index.name === 'domainHash_1_addressKey_1_reasonCode_1');
    expect(key?.unique).toBe(true);
  });

  it('writes one domain-only row for concurrent retries of the same cause', async () => {
    const input = { domain: 'hotel.example', reasonCode: 'objection', reason: 'r' } as const;
    await Promise.all(Array.from({ length: 8 }, () => addSuppressionEntry(connection!, input)));
    expect(await Suppression().countDocuments({})).toBe(1);
    expect(await isSuppressed(connection!, 'hotel.example')).toBe(true);
  });

  it('keeps domain-only and address rows for the same domain distinct', async () => {
    await addSuppressionEntry(connection!, {
      domain: 'hotel.example',
      reasonCode: 'objection',
      reason: 'r',
    });
    await addSuppressionEntry(connection!, {
      domain: 'hotel.example',
      address: 'contact@hotel.example',
      reasonCode: 'objection',
      reason: 'r',
    });
    await addSuppressionEntry(connection!, {
      domain: 'hotel.example',
      address: 'contact@hotel.example',
      reasonCode: 'objection',
      reason: 'r',
    });
    expect(await Suppression().countDocuments({})).toBe(2);
  });

  it('treats a row written before addressKey existed as the same cause', async () => {
    const domainHash = hashSuppressionValue(normalizeDomainForHash('legacy.example'));
    const addressHash = hashSuppressionValue(normalizeAddressForHash('info@legacy.example'));
    await Suppression().collection.insertMany([
      {
        suppressionId: 'legacy-domain',
        domainHash,
        reasonCode: 'objection',
        reason: 'r',
        createdAt: new Date(),
      },
      {
        suppressionId: 'legacy-address',
        domainHash,
        addressHash,
        reasonCode: 'objection',
        reason: 'r',
        createdAt: new Date(),
      },
    ]);
    await addSuppressionEntry(connection!, {
      domain: 'legacy.example',
      reasonCode: 'objection',
      reason: 'r',
    });
    await addSuppressionEntry(connection!, {
      domain: 'legacy.example',
      address: 'info@legacy.example',
      reasonCode: 'objection',
      reason: 'r',
    });
    expect(await Suppression().countDocuments({})).toBe(2);
  });
});
