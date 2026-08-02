import { describe, expect, it } from 'vitest';
import { assignFindingIds } from './finding-id.js';
import { FINDINGS_SCHEMA_VERSION, type Finding } from '../types/findings.js';

function buildFinding(overrides: Partial<Omit<Finding, 'findingId'>>): Omit<Finding, 'findingId'> {
  return {
    auditId: 'audit-1',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'moderate',
    wcagCriteria: [],
    title: 'title',
    description: 'description',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'aaaaaaaaaaaaaaaa',
    firstSeenAt: new Date('2026-08-02T00:00:00.000Z'),
    lastSeenAt: new Date('2026-08-02T00:00:00.000Z'),
    ...overrides,
  };
}

describe('assignFindingIds', () => {
  it('sorts by severity descending, then dedupeKey ascending', () => {
    const input = [
      buildFinding({ severity: 'minor', dedupeKey: 'zzzz' }),
      buildFinding({ severity: 'critical', dedupeKey: 'bbbb' }),
      buildFinding({ severity: 'critical', dedupeKey: 'aaaa' }),
      buildFinding({ severity: 'moderate', dedupeKey: 'cccc' }),
    ];

    const result = assignFindingIds(input);

    expect(result.map((f) => f.dedupeKey)).toEqual(['aaaa', 'bbbb', 'cccc', 'zzzz']);
    expect(result.map((f) => f.findingId)).toEqual(['f001', 'f002', 'f003', 'f004']);
  });

  it('is stable across re-runs on the same input (same order every time)', () => {
    const input = [
      buildFinding({ severity: 'serious', dedupeKey: 'bbbb' }),
      buildFinding({ severity: 'serious', dedupeKey: 'aaaa' }),
    ];

    const first = assignFindingIds(input).map((f) => f.findingId);
    const second = assignFindingIds(input).map((f) => f.findingId);
    expect(first).toEqual(second);
  });

  it('zero-pads beyond 999 findings', () => {
    const input = Array.from({ length: 1000 }, (_, i) =>
      buildFinding({ dedupeKey: String(i).padStart(16, '0') }),
    );

    const result = assignFindingIds(input);
    expect(result[0]?.findingId).toBe('f0001');
    expect(result[999]?.findingId).toBe('f1000');
  });

  it('does not mutate the input array order', () => {
    const input = [
      buildFinding({ severity: 'minor', dedupeKey: 'b' }),
      buildFinding({ severity: 'critical', dedupeKey: 'a' }),
    ];
    const inputCopy = [...input];
    assignFindingIds(input);
    expect(input).toEqual(inputCopy);
  });
});
