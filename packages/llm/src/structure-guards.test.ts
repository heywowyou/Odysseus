import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { findInventedStructureFindingIds, findUnreferencedStructureFindingIds } from './structure-guards.js';
import type { StructurePassOutput } from './structure-schema.js';

function buildFinding(findingId: string): Finding {
  return {
    findingId,
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: ['1.4.3'],
    title: 'Insufficient color contrast',
    description: 'Text does not meet minimum contrast ratio',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: `dedupe-${findingId}`,
    firstSeenAt: new Date('2026-08-02T00:00:00Z'),
    lastSeenAt: new Date('2026-08-02T00:00:00Z'),
  };
}

const findings: Finding[] = [buildFinding('f1'), buildFinding('f2')];

describe('findInventedStructureFindingIds', () => {
  it('returns an empty array when every referenced ID is known', () => {
    const output: StructurePassOutput = {
      themes: [{ findingIds: ['f1', 'f2'], category: 'accessibility', effort: 'low', impact: 'high', priorityRank: 1 }],
      quickWins: ['f1'],
      overallRisk: 'medium',
    };
    expect(findInventedStructureFindingIds(output, findings)).toEqual([]);
  });

  it('flags an invented ID inside a theme.findingIds', () => {
    const output: StructurePassOutput = {
      themes: [
        { findingIds: ['f1', 'bogus-id'], category: 'accessibility', effort: 'low', impact: 'high', priorityRank: 1 },
      ],
      quickWins: [],
      overallRisk: 'medium',
    };
    expect(findInventedStructureFindingIds(output, findings)).toEqual(['bogus-id']);
  });

  it('flags an invented ID that appears only in quickWins', () => {
    const output: StructurePassOutput = {
      themes: [{ findingIds: ['f1'], category: 'accessibility', effort: 'low', impact: 'high', priorityRank: 1 }],
      quickWins: ['bogus-quick-win'],
      overallRisk: 'medium',
    };
    expect(findInventedStructureFindingIds(output, findings)).toEqual(['bogus-quick-win']);
  });
});

describe('findUnreferencedStructureFindingIds', () => {
  it('counts findings not referenced by any theme', () => {
    const output: StructurePassOutput = {
      themes: [{ findingIds: ['f1'], category: 'accessibility', effort: 'low', impact: 'high', priorityRank: 1 }],
      quickWins: [],
      overallRisk: 'medium',
    };
    expect(findUnreferencedStructureFindingIds(output, findings)).toEqual(['f2']);
  });

  it('does not count quickWins as coverage', () => {
    const output: StructurePassOutput = {
      themes: [{ findingIds: ['f1'], category: 'accessibility', effort: 'low', impact: 'high', priorityRank: 1 }],
      quickWins: ['f2'],
      overallRisk: 'medium',
    };
    expect(findUnreferencedStructureFindingIds(output, findings)).toEqual(['f2']);
  });
});
