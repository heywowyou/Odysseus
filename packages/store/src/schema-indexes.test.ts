import { afterAll, describe, expect, it } from 'vitest';
import { MODEL_FACTORIES, probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('schema_indexes'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

describe.skipIf(!available)('schema indexes', () => {
  // Index builds are DDL on a fresh database. Under the full suite's Mongo
  // contention, running seventeen collections one after another exceeded the
  // default 20 s, so the independent models build concurrently within an
  // explicit DDL budget.
  it('builds every declared index on every model without error', { timeout: 60_000 }, async () => {
    await Promise.all(
      MODEL_FACTORIES.map(async (factory) => {
        const model = factory(connection!);
        await expect(model.syncIndexes(), model.modelName).resolves.toBeDefined();
        const declared = model.schema.indexes().length;
        const built = (await model.listIndexes()).filter((index) => index.name !== '_id_');
        expect(built.length, model.modelName).toBeGreaterThanOrEqual(declared);
      }),
    );
  });
});
