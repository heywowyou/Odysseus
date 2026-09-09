import { describe, expect, it } from 'vitest';
import { scopedMongoTestUri } from './test-support.js';

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
