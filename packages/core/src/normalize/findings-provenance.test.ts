import { describe, expect, it } from 'vitest';
import type { Finding } from '../types/findings.js';
import {
  NORMALIZATION_FINGERPRINT,
  assertFindingsProvenance,
  buildFindingsProvenance,
  canonicalizeForFindingsDigest,
} from './findings-provenance.js';
import { normalizeFingerprint } from '../../../../scripts/fixture-fingerprint.mjs';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: 'f001',
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: ['1.4.3'],
    title: 'Color contrast',
    description: 'Text does not have enough contrast.',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: { nested: { z: 1, a: 2 } },
    dedupeKey: 'dedupe-1',
    firstSeenAt: new Date('2026-08-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('findings provenance', () => {
  it('matches the source fingerprint used by fixture freshness', () => {
    expect(NORMALIZATION_FINGERPRINT).toBe(normalizeFingerprint());
  });

  it('builds the same digest when object keys have a different insertion order', () => {
    const first = finding({ rawEvidence: { z: 1, a: { y: 2, x: 3 } } });
    const second = finding({ rawEvidence: { a: { x: 3, y: 2 }, z: 1 } });

    expect(buildFindingsProvenance([first])).toEqual(buildFindingsProvenance([second]));
  });

  it('changes the digest when a finding fact changes', () => {
    const before = buildFindingsProvenance([finding()]);
    const after = buildFindingsProvenance([finding({ occurrences: 2 })]);

    expect(after.findingsDigest).not.toBe(before.findingsDigest);
  });

  it('fails closed for missing or mismatched provenance', () => {
    const expected = buildFindingsProvenance([finding()]);

    expect(() => assertFindingsProvenance(undefined, expected, 'analysis')).toThrow(
      /legacy analysis.*normalize.*regenerate/i,
    );
    expect(() =>
      assertFindingsProvenance(
        { ...expected, findingsDigest: 'sha256:not-the-current-findings' },
        expected,
        'analysis',
      ),
    ).toThrow(/stale analysis.*findings digest/i);
  });
});

describe('findings digest key order (issue #504)', () => {
  it('orders object keys by code unit, not by locale collation', () => {
    const canonical = canonicalizeForFindingsDigest({ a: 1, é: 2, _: 3, B: 4 }) as Record<
      string,
      unknown
    >;
    expect(Object.keys(canonical)).toEqual(['B', '_', 'a', 'é']);
  });

  it('orders URL keys of per-page evidence by code unit', () => {
    const canonical = canonicalizeForFindingsDigest({
      'https://example.com/b': 1,
      'https://example.com/B': 2,
      'https://example.com/-': 3,
    }) as Record<string, unknown>;
    expect(Object.keys(canonical)).toEqual([
      'https://example.com/-',
      'https://example.com/B',
      'https://example.com/b',
    ]);
  });
});
