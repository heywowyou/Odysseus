import { describe, expect, it, vi } from 'vitest';
import type { Finding } from '@odysseus/core';
import { CLAUDE_EFFORT, CLAUDE_MODEL, MAX_RETRIES } from './constants.js';
import type { StructureInput, StructurePassOutput } from './structure-schema.js';

vi.mock('./client.js', () => ({
  callClaudeForStructure: vi.fn(),
}));

const { callClaudeForStructure } = await import('./client.js');
const { analyzeStructure } = await import('./analyze-structure.js');

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

const filteredFindings: Finding[] = [buildFinding('f1'), buildFinding('f2')];

const input: StructureInput = {
  siteContext: {
    businessType: 'e-commerce',
    primaryGoal: 'sales',
    languagesServed: ['en'],
    targetMarkets: ['us'],
  },
  findings: filteredFindings.map((f) => ({
    findingId: f.findingId,
    source: f.source,
    ruleId: f.ruleId,
    category: f.category,
    severity: f.severity,
    wcagCriteria: f.wcagCriteria,
    title: f.title,
    description: f.description,
    pageUrls: f.pageUrls,
    occurrences: f.occurrences,
  })),
};

function buildCleanOutput(): StructurePassOutput {
  return {
    themes: [
      {
        category: 'accessibility',
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
        findingIds: ['f1', 'f2'],
      },
    ],
    quickWins: ['f1'],
    overallRisk: 'medium',
  };
}

function buildInventedOutput(): StructurePassOutput {
  const output = buildCleanOutput();
  output.themes[0]!.findingIds.push('bogus-id-not-in-input');
  return output;
}

describe('analyzeStructure', () => {
  it('returns themeKey-assigned themes on a clean pass and reports unreferenced findings', async () => {
    vi.mocked(callClaudeForStructure).mockReset().mockResolvedValueOnce({
      output: buildCleanOutput(),
      refused: false,
    });

    const result = await analyzeStructure(input, filteredFindings, false);

    expect(result.themes).toEqual([
      { themeKey: 't1', category: 'accessibility', effort: 'low', impact: 'high', priorityRank: 1, findingIds: ['f1', 'f2'] },
    ]);
    expect(result.model).toBe(CLAUDE_MODEL);
    expect(result.effort).toBe(CLAUDE_EFFORT);
    expect(result.unreferencedFindingCount).toBe(0);
    expect(callClaudeForStructure).toHaveBeenCalledTimes(1);
  });

  it('retries once when the first response invents a finding ID, then succeeds', async () => {
    vi.mocked(callClaudeForStructure)
      .mockReset()
      .mockResolvedValueOnce({ output: buildInventedOutput(), refused: false })
      .mockResolvedValueOnce({ output: buildCleanOutput(), refused: false });

    const result = await analyzeStructure(input, filteredFindings, false);

    expect(result.themes[0]!.findingIds).toEqual(['f1', 'f2']);
    expect(callClaudeForStructure).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries rather than returning a partial result', async () => {
    vi.mocked(callClaudeForStructure)
      .mockReset()
      .mockResolvedValue({ output: buildInventedOutput(), refused: false });

    await expect(analyzeStructure(input, filteredFindings, false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callClaudeForStructure).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });
});
