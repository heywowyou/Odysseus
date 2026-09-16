import { describe, expect, it, vi } from 'vitest';
import { isMongoTestRequired, probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

describe('scopedMongoTestUri', () => {
  it('gives an integration suite its own database while preserving URI options', () => {
    expect(
      scopedMongoTestUri(
        'hotel_qualifications',
        'mongodb://localhost:27018/odysseus_test?replicaSet=rs0',
      ),
    ).toBe('mongodb://localhost:27018/odysseus_test_hotel_qualifications?replicaSet=rs0');
  });

  it('normalizes a scope before using it in a database name', () => {
    expect(scopedMongoTestUri('hotel qualifications/2026', 'mongodb://localhost:27018/')).toBe(
      'mongodb://localhost:27018/odysseus_test_hotel_qualifications_2026',
    );
  });
});

describe('isMongoTestRequired', () => {
  it('requires Mongo in CI or when explicitly asked, and skips otherwise', () => {
    expect(isMongoTestRequired({})).toBe(false);
    expect(isMongoTestRequired({ CI: 'true' })).toBe(true);
    expect(isMongoTestRequired({ CI: '1' })).toBe(true);
    expect(isMongoTestRequired({ CI: 'false' })).toBe(false);
    expect(isMongoTestRequired({ REQUIRE_MONGO_TESTS: '1' })).toBe(true);
    expect(isMongoTestRequired({ REQUIRE_MONGO_TESTS: '0' })).toBe(false);
  });
});

describe('probeMongoAvailability', () => {
  // Port 1 on loopback is reserved and refuses connections immediately. The
  // skip branch is not exercised here: it writes the shared skip marker,
  // which would make every unit run report a phantom skipped store suite.
  const unreachableUri = 'mongodb://127.0.0.1:1/odysseus_test';

  it('fails instead of skipping when Mongo is required', async () => {
    vi.stubEnv('REQUIRE_MONGO_TESTS', '1');
    try {
      await expect(probeMongoAvailability(unreachableUri)).rejects.toThrow(/Refusing to skip them/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
