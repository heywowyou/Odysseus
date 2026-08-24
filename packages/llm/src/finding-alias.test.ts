import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import {
  aliasStructureInput,
  buildFindingAliasMap,
  resolveStructureOutputIds,
} from './finding-alias.js';
import { findInventedStructureFindingIds } from './structure-guards.js';
import type { StructureInput, StructurePassOutput } from './structure-schema.js';

function buildFinding(findingId: string, ruleId = 'link-name'): Finding {
  return {
    findingId,
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'axe',
    ruleId,
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: ['4.1.2'],
    title: 'Link without discernible text',
    description: 'A link has no text a screen reader can announce',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: `dedupe-${findingId}`,
    firstSeenAt: new Date('2026-08-24T00:00:00Z'),
    lastSeenAt: new Date('2026-08-24T00:00:00Z'),
  };
}

function buildInput(findings: readonly Finding[]): StructureInput {
  return {
    siteContext: {
      businessType: 'hotel',
      primaryGoal: 'bookings',
      targetMarkets: ['FR'],
      languagesServed: ['fr'],
    },
    findings: findings.map((finding) => ({
      findingId: finding.findingId,
      source: finding.source,
      ruleId: finding.ruleId,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      occurrences: finding.occurrences,
      pageUrls: [...finding.pageUrls],
    })) as StructureInput['findings'],
  };
}

/** The real La Corniche shape: a run of the same rule with one ID missing
 *  from the middle, because that finding was diverted before the model saw
 *  anything. Six structure attempts in a row closed the run and were rejected. */
const laCornicheShape = [
  buildFinding('f316'),
  buildFinding('f317'),
  buildFinding('f318'),
  buildFinding('f319'),
  // f320 diverted (crawlable-anchors, a noindex legal page)
  buildFinding('f321'),
  buildFinding('f322'),
  buildFinding('f323'),
  buildFinding('f324'),
];

describe('buildFindingAliasMap', () => {
  it('assigns a gapless alias sequence over the findings the model is shown', () => {
    const map = buildFindingAliasMap(laCornicheShape);

    expect([...map.toAlias.values()]).toEqual(['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8']);
  });

  it('leaves no numeric hole for the model to close, even though the real IDs have one', () => {
    const map = buildFindingAliasMap(laCornicheShape);
    const realIds = [...map.toAlias.keys()];

    // The defect being fixed, asserted directly: the real space is sparse.
    expect(realIds).not.toContain('f320');
    expect(realIds.length).toBe(8);

    const aliasNumbers = [...map.toReal.keys()].map((alias) => Number(alias.slice(1)));
    expect(aliasNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('does not use the real finding ID prefix, so a leaked alias is obvious', () => {
    const map = buildFindingAliasMap(laCornicheShape);
    for (const alias of map.toReal.keys()) expect(alias.startsWith('f')).toBe(false);
  });

  it('handles an empty finding set', () => {
    const map = buildFindingAliasMap([]);
    expect(map.aliasedIds).toEqual([]);
  });
});

describe('aliasStructureInput', () => {
  it('replaces every findingId with its alias and changes nothing else', () => {
    const input = buildInput(laCornicheShape);
    const map = buildFindingAliasMap(laCornicheShape);
    const aliased = aliasStructureInput(input, map);

    expect(aliased.findings.map((f) => f.findingId)).toEqual(['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8']);
    expect(aliased.siteContext).toEqual(input.siteContext);
    expect(aliased.findings[0]?.ruleId).toBe(input.findings[0]?.ruleId);
    expect(aliased.findings[0]?.pageUrls).toEqual(input.findings[0]?.pageUrls);
  });

  it('never exposes a diverted finding ID to the model', () => {
    const aliased = aliasStructureInput(buildInput(laCornicheShape), buildFindingAliasMap(laCornicheShape));
    expect(JSON.stringify(aliased)).not.toContain('f320');
  });

  it('throws rather than silently passing an unaliased ID through', () => {
    const map = buildFindingAliasMap([buildFinding('f1')]);
    expect(() => aliasStructureInput(buildInput([buildFinding('f2')]), map)).toThrow(/no alias for finding/);
  });
});

describe('resolveStructureOutputIds', () => {
  it('round-trips aliases back to the exact real finding IDs', () => {
    const map = buildFindingAliasMap(laCornicheShape);
    const output: StructurePassOutput = {
      themes: [
        { findingIds: ['x1', 'x2', 'x3', 'x4'], category: 'accessibility', effort: 'low', impact: 'high', priorityRank: 1 },
        { findingIds: ['x5', 'x6', 'x7', 'x8'], category: 'seo', effort: 'medium', impact: 'medium', priorityRank: 2 },
      ],
      quickWins: ['x1'],
      overallRisk: 'high',
    };

    const resolved = resolveStructureOutputIds(output, map);

    expect(resolved.themes[0]?.findingIds).toEqual(['f316', 'f317', 'f318', 'f319']);
    expect(resolved.themes[1]?.findingIds).toEqual(['f321', 'f322', 'f323', 'f324']);
    expect(resolved.quickWins).toEqual(['f316']);
    expect(resolved.overallRisk).toBe('high');
    expect(resolved.themes[0]?.priorityRank).toBe(1);
  });

  it('throws if an unknown alias somehow reaches it', () => {
    const map = buildFindingAliasMap(laCornicheShape);
    const output: StructurePassOutput = {
      themes: [{ findingIds: ['x99'], category: 'seo', effort: 'low', impact: 'low', priorityRank: 1 }],
      quickWins: [],
      overallRisk: 'low',
    };
    expect(() => resolveStructureOutputIds(output, map)).toThrow(/has no real finding ID/);
  });
});

describe('the invented-ID guard in alias space', () => {
  const map = buildFindingAliasMap(laCornicheShape);

  it('accepts an ID the model could only have got by completing the run, because it now denotes a finding it was shown', () => {
    const output: StructurePassOutput = {
      themes: [
        { findingIds: ['x1', 'x2', 'x3', 'x4', 'x5'], category: 'accessibility', effort: 'low', impact: 'high', priorityRank: 1 },
      ],
      quickWins: [],
      overallRisk: 'medium',
    };
    expect(findInventedStructureFindingIds(output, map.aliasedIds)).toEqual([]);
    // and it resolves to a real finding, never to the diverted one
    expect(resolveStructureOutputIds(output, map).themes[0]?.findingIds).not.toContain('f320');
  });

  it('still hard-rejects an ID outside the range the model was shown', () => {
    const output: StructurePassOutput = {
      themes: [{ findingIds: ['x1', 'x9'], category: 'seo', effort: 'low', impact: 'low', priorityRank: 1 }],
      quickWins: [],
      overallRisk: 'low',
    };
    expect(findInventedStructureFindingIds(output, map.aliasedIds)).toEqual(['x9']);
  });

  it('hard-rejects a real finding ID copied in from outside the alias space', () => {
    const output: StructurePassOutput = {
      themes: [{ findingIds: ['f320'], category: 'seo', effort: 'low', impact: 'low', priorityRank: 1 }],
      quickWins: [],
      overallRisk: 'low',
    };
    expect(findInventedStructureFindingIds(output, map.aliasedIds)).toEqual(['f320']);
  });
});
