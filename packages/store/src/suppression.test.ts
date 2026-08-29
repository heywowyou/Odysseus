import { afterAll, describe, expect, it } from 'vitest';
import { addSuppressionEntry, isSuppressed } from './suppression.js';
import { createSuppressionModel } from './schemas/suppression.schema.js';
import { createProspectModel } from './schemas/prospect.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('suppression', () => {
  it('checking an unrecorded domain returns false', async () => {
    expect(await isSuppressed(connection!, 'never-suppressed.fr')).toBe(false);
  });

  it('suppresses a domain by hash and finds it regardless of formatting', async () => {
    await addSuppressionEntry(connection!, {
      domain: 'https://www.Opt-Out.fr/',
      reason: 'requested removal',
    });
    expect(await isSuppressed(connection!, 'opt-out.fr')).toBe(true);
    expect(await isSuppressed(connection!, 'OPT-OUT.FR')).toBe(true);
  });

  it('suppresses by address independently of domain', async () => {
    await addSuppressionEntry(connection!, {
      domain: 'address-suppress.fr',
      address: 'contact@address-suppress.fr',
      reason: 'unsubscribed',
    });
    expect(
      await isSuppressed(connection!, 'a-different-domain.fr', 'contact@address-suppress.fr'),
    ).toBe(true);
  });

  it('stores no raw domain or address anywhere on the document', async () => {
    // The objection path is the one place a prospect hands us an address they
    // want us to stop using. Keeping it in readable form to honour that request
    // would be collecting more of what they objected to, which is why the
    // collection is hash-only. This asserts it of the stored bytes rather than
    // of the writer, so a later field added in good faith cannot reintroduce it.
    await addSuppressionEntry(connection!, {
      domain: 'no-raw-value.fr',
      address: 'reservation@no-raw-value.fr',
      reason: 'objection received',
    });
    const stored = await createSuppressionModel(connection!)
      .findOne({ reason: 'objection received' })
      .lean();
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain('no-raw-value.fr');
    expect(serialized).not.toContain('reservation@');
  });

  it('as a regression guard, the suppression collection has no TTL index at all', async () => {
    const SuppressionModel = createSuppressionModel(connection!);
    const indexes = await SuppressionModel.collection.indexes();
    const ttlIndex = indexes.find((index) => index.expireAfterSeconds !== undefined);
    expect(ttlIndex).toBeUndefined();
  });

  it('the prospects TTL index does not leak onto the suppression collection', async () => {
    // Sanity check that the two collections really are separate models -
    // exercising createProspectModel here must not affect suppression's
    // own index list.
    createProspectModel(connection!);
    const SuppressionModel = createSuppressionModel(connection!);
    const indexes = await SuppressionModel.collection.indexes();
    expect(indexes.find((index) => index.expireAfterSeconds !== undefined)).toBeUndefined();
  });
});
