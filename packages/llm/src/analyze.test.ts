import { describe, expect, it, vi } from 'vitest';
import type { Finding, LlmInput, LlmOutput } from '@odysseus/core';
import { CLAUDE_EFFORT, CLAUDE_MODEL, MAX_RETRIES } from './constants.js';

vi.mock('./client.js', () => ({
  callClaude: vi.fn(),
}));

const { callClaude } = await import('./client.js');
const { analyzeFindings } = await import('./analyze.js');

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

const input: LlmInput = {
  language: 'en',
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

function buildCleanOutput(): LlmOutput {
  return {
    executiveSummary: 'Summary.',
    overallRisk: 'medium',
    themes: [
      {
        title: 'Contrast issues',
        category: 'accessibility',
        businessImpact: 'Some users cannot read the text.',
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
        findingIds: ['f1', 'f2'],
        recommendedActions: ['Increase contrast ratio.'],
      },
    ],
    quickWins: ['f1'],
    notes: '',
  };
}

function buildInventedOutput(): LlmOutput {
  const output = buildCleanOutput();
  output.themes[0]!.findingIds.push('bogus-id-not-in-input');
  return output;
}

describe('analyzeFindings', () => {
  it('returns the output on a clean pass and reports unreferenced findings', async () => {
    vi.mocked(callClaude).mockReset().mockResolvedValueOnce({
      output: buildCleanOutput(),
      refused: false,
    });

    const result = await analyzeFindings(input, filteredFindings, false);

    expect(result.output.themes).toHaveLength(1);
    expect(result.model).toBe(CLAUDE_MODEL);
    expect(result.effort).toBe(CLAUDE_EFFORT);
    expect(result.unreferencedFindingCount).toBe(0);
    expect(callClaude).toHaveBeenCalledTimes(1);
  });

  it('retries once when the first response invents a finding ID, then succeeds', async () => {
    vi.mocked(callClaude)
      .mockReset()
      .mockResolvedValueOnce({ output: buildInventedOutput(), refused: false })
      .mockResolvedValueOnce({ output: buildCleanOutput(), refused: false });

    const result = await analyzeFindings(input, filteredFindings, false);

    expect(result.output.themes[0]!.findingIds).toEqual(['f1', 'f2']);
    expect(callClaude).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries rather than returning a partial result', async () => {
    vi.mocked(callClaude)
      .mockReset()
      .mockResolvedValue({ output: buildInventedOutput(), refused: false });

    await expect(analyzeFindings(input, filteredFindings, false)).rejects.toThrow(
      /exhausted \d+ attempts/,
    );
    expect(callClaude).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });
});
