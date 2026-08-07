import { afterAll, describe, expect, it } from 'vitest';
import type { OperatorProfile } from '@odysseus/core';
import { upsertSireneCache, getCachedSireneProfile } from './persist-sirene-cache.js';
import { createSireneCacheModel } from './schemas/sirene-cache.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) {
    await connection.dropDatabase();
    await connection.close();
  }
});

function buildProfile(overrides: Partial<OperatorProfile> = {}): OperatorProfile {
  const retrievedAt = new Date('2026-01-01T00:00:00.000Z');
  return {
    siren: { value: '732829320', source: 'sirene-api', retrievedAt },
    denomination: { value: 'Test Company', source: 'sirene-api', retrievedAt },
    naf: { value: '62.01Z', source: 'sirene-api', retrievedAt },
    legalForm: { value: 'SAS', source: 'sirene-api', retrievedAt },
    effectifBand: { value: { code: '02', label: '3 a 5 salaries' }, source: 'sirene-api', retrievedAt },
    turnover: { value: 500_000, source: 'sirene-api', retrievedAt },
    ...overrides,
  };
}

describe.skipIf(!mongoAvailable)('sirene cache', () => {
  it('caches a profile and returns it on a subsequent lookup', async () => {
    const profile = buildProfile({ siren: { value: '111111116', source: 'sirene-api', retrievedAt: new Date() } });
    await upsertSireneCache(connection!, '111111116', profile, new Date('2026-01-01T00:00:00.000Z'));

    const cached = await getCachedSireneProfile(connection!, '111111116');
    expect(cached?.siren.value).toBe('111111116');
    expect(cached?.effectifBand.value?.code).toBe('02');
  });

  it('returns undefined for a SIREN never looked up', async () => {
    expect(await getCachedSireneProfile(connection!, '999999999')).toBeUndefined();
  });

  it('returns a plain object every field of which survives a shallow spread (regression: a live Mongoose subdocument silently drops fields when spread)', async () => {
    const profile = buildProfile({ siren: { value: '552032534', source: 'sirene-api', retrievedAt: new Date() } });
    await upsertSireneCache(connection!, '552032534', profile, new Date('2026-01-01T00:00:00.000Z'));

    const cached = await getCachedSireneProfile(connection!, '552032534');
    // Exactly the operation packages/interface's obligation-stage.ts
    // performs when tagging siren provenance - must not silently lose
    // `value`/`retrievedAt`.
    const spread = { ...cached!.siren, source: 'siren:manual' };
    expect(spread).toEqual({ value: '552032534', source: 'siren:manual', retrievedAt: cached!.siren.retrievedAt });
  });

  it('upserts: a second call for the same SIREN converges to the latest retrievedAt, not a duplicate document', async () => {
    const siren = '222222229';
    await upsertSireneCache(connection!, siren, buildProfile(), new Date('2026-01-01T00:00:00.000Z'));
    await upsertSireneCache(connection!, siren, buildProfile(), new Date('2026-02-01T00:00:00.000Z'));

    const SireneCacheModel = createSireneCacheModel(connection!);
    expect(await SireneCacheModel.countDocuments({ siren })).toBe(1);

    const stored = await SireneCacheModel.findOne({ siren });
    expect(stored?.retrievedAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});
