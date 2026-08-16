import { afterAll, describe, expect, it } from 'vitest';
import { getCheckpoint, upsertCheckpoint } from './prospect-ingestion-checkpoint.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('prospect ingestion checkpoint', () => {
  it('returns null for an unknown checkpoint', async () => {
    expect(await getCheckpoint(connection!, 'no-such-checkpoint')).toBeNull();
  });

  it('upserts and reads back a checkpoint', async () => {
    await upsertCheckpoint(connection!, 'afnic-fichier-a-test', {
      sourceFilePath: '/data/afnic/fichier-a.csv',
      sourceFileVersion: 'v1',
      nextByteOffset: 1000,
      rowsProcessed: 50,
    });

    const first = await getCheckpoint(connection!, 'afnic-fichier-a-test');
    expect(first?.nextByteOffset).toBe(1000);
    expect(first?.rowsProcessed).toBe(50);

    await upsertCheckpoint(connection!, 'afnic-fichier-a-test', { nextByteOffset: 2000, rowsProcessed: 100 });
    const second = await getCheckpoint(connection!, 'afnic-fichier-a-test');
    expect(second?.nextByteOffset).toBe(2000);
    expect(second?.rowsProcessed).toBe(100);
    // sourceFilePath/sourceFileVersion persist across a partial patch.
    expect(second?.sourceFilePath).toBe('/data/afnic/fichier-a.csv');
  });
});
