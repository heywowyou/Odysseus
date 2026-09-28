import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import {
  findDuplicateStructureFindingIds,
  findInventedStructureFindingIds,
  findThemeCategoryMismatches,
  findUnreferencedStructureFindingIds,
} from './structure-guards.js';
import { parseStructureDocument, type StructurePassOutput } from './structure-schema.js';

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
      themes: [
        {
          findingIds: ['f1', 'f2'],
          category: 'accessibility',
          effort: 'low',
          impact: 'high',
          priorityRank: 1,
        },
      ],
      quickWins: ['f1'],
      overallRisk: 'medium',
    };
    expect(findInventedStructureFindingIds(output, findings)).toEqual([]);
  });

  it('flags an invented ID inside a theme.findingIds', () => {
    const output: StructurePassOutput = {
      themes: [
        {
          findingIds: ['f1', 'bogus-id'],
          category: 'accessibility',
          effort: 'low',
          impact: 'high',
          priorityRank: 1,
        },
      ],
      quickWins: [],
      overallRisk: 'medium',
    };
    expect(findInventedStructureFindingIds(output, findings)).toEqual(['bogus-id']);
  });

  it('flags an invented ID that appears only in quickWins', () => {
    const output: StructurePassOutput = {
      themes: [
        {
          findingIds: ['f1'],
          category: 'accessibility',
          effort: 'low',
          impact: 'high',
          priorityRank: 1,
        },
      ],
      quickWins: ['bogus-quick-win'],
      overallRisk: 'medium',
    };
    expect(findInventedStructureFindingIds(output, findings)).toEqual(['bogus-quick-win']);
  });
});

describe('findUnreferencedStructureFindingIds', () => {
  it('counts findings not referenced by any theme', () => {
    const output: StructurePassOutput = {
      themes: [
        {
          findingIds: ['f1'],
          category: 'accessibility',
          effort: 'low',
          impact: 'high',
          priorityRank: 1,
        },
      ],
      quickWins: [],
      overallRisk: 'medium',
    };
    expect(findUnreferencedStructureFindingIds(output, findings)).toEqual(['f2']);
  });

  it('does not count quickWins as coverage', () => {
    const output: StructurePassOutput = {
      themes: [
        {
          findingIds: ['f1'],
          category: 'accessibility',
          effort: 'low',
          impact: 'high',
          priorityRank: 1,
        },
      ],
      quickWins: ['f2'],
      overallRisk: 'medium',
    };
    expect(findUnreferencedStructureFindingIds(output, findings)).toEqual(['f2']);
  });
});

describe('findDuplicateStructureFindingIds', () => {
  it('finds repeats within one theme and across themes', () => {
    expect(
      findDuplicateStructureFindingIds({
        themes: [
          {
            findingIds: ['f1', 'f1'],
            category: 'accessibility',
            effort: 'low',
            impact: 'high',
            priorityRank: 1,
          },
          {
            findingIds: ['f1', 'f2'],
            category: 'seo',
            effort: 'low',
            impact: 'high',
            priorityRank: 2,
          },
        ],
        quickWins: [],
      }),
    ).toEqual(['f1']);
  });

  it('finds duplicates inside quickWins but permits a theme and quickWin to share an ID', () => {
    const output: StructurePassOutput = {
      themes: [
        {
          findingIds: ['f1'],
          category: 'accessibility',
          effort: 'low',
          impact: 'high',
          priorityRank: 1,
        },
      ],
      quickWins: ['f1', 'f1'],
      overallRisk: 'medium',
    };
    expect(findDuplicateStructureFindingIds(output)).toEqual(['f1']);
    expect(findDuplicateStructureFindingIds({ ...output, quickWins: ['f1'] })).toEqual([]);
  });

  it('rejects a stored structure document that repeats a finding across themes', () => {
    expect(() =>
      parseStructureDocument({
        auditId: 'audit-1',
        themes: [
          {
            themeKey: 't1',
            findingIds: ['f1'],
            category: 'accessibility',
            effort: 'low',
            impact: 'high',
            priorityRank: 1,
          },
          {
            themeKey: 't2',
            findingIds: ['f1'],
            category: 'seo',
            effort: 'low',
            impact: 'high',
            priorityRank: 2,
          },
        ],
        quickWins: [],
        overallRisk: 'medium',
        model: 'test-model',
        temperature: 1,
        generatedAt: '2026-09-23T00:00:00.000Z',
      }),
    ).toThrow('structure document contains repeated finding ID(s): f1');
  });
});

describe('findThemeCategoryMismatches', () => {
  const theme = (
    findingIds: string[],
    category: StructurePassOutput['themes'][number]['category'],
  ) => ({
    findingIds,
    category,
    effort: 'low' as const,
    impact: 'high' as const,
    priorityRank: 1,
  });
  const seoFinding = { ...buildFinding('s1'), category: 'seo' as const };
  const geoFinding = { ...buildFinding('g1'), category: 'geo' as const };

  it('rejects an accessibility theme labelled seo', () => {
    expect(findThemeCategoryMismatches({ themes: [theme(['f1', 'f2'], 'seo')] }, findings)).toEqual(
      ['theme 1 is labelled seo but its findings are accessibility'],
    );
  });

  it('accepts a label one of its findings carries, and geo findings under seo', () => {
    const all = [...findings, seoFinding, geoFinding];
    expect(
      findThemeCategoryMismatches(
        {
          themes: [
            theme(['f1', 's1'], 'seo'),
            theme(['g1'], 'seo'),
            theme(['f2'], 'accessibility'),
          ],
        },
        all,
      ),
    ).toEqual([]);
  });
});
