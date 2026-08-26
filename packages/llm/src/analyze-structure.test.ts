import { describe, expect, it, vi } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import { MISTRAL_MODEL, MISTRAL_TEMPERATURE, MAX_RETRIES } from './constants.js';
import type { StructureInput, StructurePassOutput } from './structure-schema.js';

vi.mock('./client.js', () => ({
  callMistralForStructure: vi.fn(),
}));

const { callMistralForStructure } = await import('./client.js');
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

function buildManifest(): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00Z',
    finishedAt: '2026-08-02T00:05:00Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '131.0.0',
    },
    config: {
      maxPages: 50,
      maxDepth: 3,
      crawlDelayMs: 500,
      pageTimeoutMs: 30000,
      lighthouseTimeoutMs: 45000,
      userAgent: 'OdysseusBot/1.0',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 50,
      maxDepth: 3,
      robotsTxtFound: true,
      effectiveDelayMs: 500,
    },
    pages: [
      {
        url: 'https://example.com/',
        pageDir: 'pages/home-abc123',
        depth: 0,
        status: 'visited',
        httpStatus: 200,
        renderDiffMissingPercent: 0,
        errors: {},
      },
    ],
  };
}

const manifest = buildManifest();

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

/** The model answers in the dense alias space finding-alias.ts puts in front
 *  of it (x1..xN over the input order), not in real finding IDs - a response
 *  quoting f1 would be an ID it was never shown. analyzeStructure resolves
 *  those aliases back before returning, which is what the assertions below
 *  check. */
function buildCleanOutput(): StructurePassOutput {
  return {
    themes: [
      {
        category: 'accessibility',
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
        findingIds: ['x1', 'x2'],
      },
    ],
    quickWins: ['x1'],
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
    vi.mocked(callMistralForStructure).mockReset().mockResolvedValueOnce({
      output: buildCleanOutput(),
    });

    const result = await analyzeStructure(input, filteredFindings, false, manifest);

    expect(result.themes).toEqual([
      {
        themeKey: 't1',
        category: 'accessibility',
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
        findingIds: ['f1', 'f2'],
      },
    ]);
    expect(result.model).toBe(MISTRAL_MODEL);
    expect(result.temperature).toBe(MISTRAL_TEMPERATURE);
    expect(result.unreferencedFindingCount).toBe(0);
    expect(callMistralForStructure).toHaveBeenCalledTimes(1);
  });

  it('shows the model aliases, never the real finding IDs', async () => {
    vi.mocked(callMistralForStructure)
      .mockReset()
      .mockResolvedValueOnce({ output: buildCleanOutput() });

    await analyzeStructure(input, filteredFindings, false, manifest);

    const sent = vi.mocked(callMistralForStructure).mock.calls[0]?.[0];
    expect(sent?.findings.map((f) => f.findingId)).toEqual(['x1', 'x2']);
    expect(JSON.stringify(sent)).not.toContain('"f1"');
  });

  it('rejects a real finding ID in the response, because the model was never shown one', async () => {
    const realIdOutput = buildCleanOutput();
    realIdOutput.themes[0]!.findingIds = ['f1', 'f2'];
    vi.mocked(callMistralForStructure)
      .mockReset()
      .mockResolvedValueOnce({ output: realIdOutput })
      .mockResolvedValueOnce({ output: buildCleanOutput() });

    const result = await analyzeStructure(input, filteredFindings, false, manifest);

    expect(result.themes[0]!.findingIds).toEqual(['f1', 'f2']);
    expect(callMistralForStructure).toHaveBeenCalledTimes(2);
  });

  it('retries once when the first response invents a finding ID, then succeeds', async () => {
    vi.mocked(callMistralForStructure)
      .mockReset()
      .mockResolvedValueOnce({ output: buildInventedOutput() })
      .mockResolvedValueOnce({ output: buildCleanOutput() });

    const result = await analyzeStructure(input, filteredFindings, false, manifest);

    expect(result.themes[0]!.findingIds).toEqual(['f1', 'f2']);
    expect(callMistralForStructure).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries rather than returning a partial result', async () => {
    vi.mocked(callMistralForStructure)
      .mockReset()
      .mockResolvedValue({ output: buildInventedOutput() });

    await expect(analyzeStructure(input, filteredFindings, false, manifest)).rejects.toThrow(
      /exhausted \d+ attempts/,
    );
    expect(callMistralForStructure).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });
});
