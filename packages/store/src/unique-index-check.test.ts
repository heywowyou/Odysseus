import { describe, expect, it } from 'vitest';
import { findMissingUniqueIndexes } from './unique-index-check.js';

describe('findMissingUniqueIndexes', () => {
  it('requires the declared unique key and its partial/sparse scope', () => {
    const required = [
      {
        modelName: 'Job',
        key: { activeSlot: 1 as const },
        options: { unique: true, partialFilterExpression: { activeSlot: { $exists: true } } },
      },
      { modelName: 'Audit', key: { auditId: 1 as const }, options: { unique: true, sparse: true } },
    ];
    expect(
      findMissingUniqueIndexes(required, [
        {
          key: { activeSlot: 1 },
          unique: true,
          partialFilterExpression: { activeSlot: { $exists: true } },
        },
        { key: { auditId: 1 }, unique: false, sparse: true },
      ]),
    ).toEqual([required[1]]);
  });
});
