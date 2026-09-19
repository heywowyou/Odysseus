import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFindingsProvenance, type AuditManifest, type Finding } from '@odysseus/core';

vi.mock('@odysseus/store', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  persistAnalysis: vi.fn(),
}));
vi.mock('./obligation-stage.js', () => ({
  runObligationStage: vi.fn(async () => ({ status: 'undetermined', basis: [] })),
}));
vi.mock('./audit-evidence-diagnostics.js', () => ({
  readAuditEvidenceDiagnostics: vi.fn(),
}));
vi.mock('@odysseus/llm', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  analyzeStructure: vi.fn(),
  analyzeWriting: vi.fn(),
  critiqueAndRepairWriting: vi.fn(),
}));

import { analyzeStructure, analyzeWriting, critiqueAndRepairWriting } from '@odysseus/llm';
import { persistAnalysis } from '@odysseus/store';
import { readAuditEvidenceDiagnostics } from './audit-evidence-diagnostics.js';
import { criticSidecarPath, runAnalysisStage } from './analysis-stage.js';

let auditDir: string;

const PROBLEM_TEXT = 'The impact blames the booking engine, which no finding concerns.';

const finding: Finding = {
  auditId: 'audit-067',
  schemaVersion: 1,
  findingId: 'f1',
  source: 'axe',
  ruleId: 'color-contrast',
  category: 'accessibility',
  severity: 'serious',
  wcagCriteria: ['1.4.3'],
  title: 'Contraste insuffisant',
  description: 'Le contraste du texte est insuffisant.',
  pageUrls: ['https://example.com/'],
  occurrences: 1,
  elements: [],
  rawEvidence: {},
  dedupeKey: 'color-contrast',
  firstSeenAt: new Date('2026-09-01T00:00:00Z'),
  lastSeenAt: new Date('2026-09-01T00:00:00Z'),
} as Finding;

function manifest(): AuditManifest {
  const provenance = buildFindingsProvenance([finding]);
  return {
    auditId: 'audit-067',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-09-01T00:00:00.000Z',
    finishedAt: '2026-09-01T00:01:00.000Z',
    findingsProvenance: provenance,
    pages: [{ url: 'https://example.com/', depth: 0, status: 'visited', errors: {} }],
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 1,
      maxDepth: 0,
      robotsTxtFound: true,
      effectiveDelayMs: 0,
    },
  } as AuditManifest;
}

function structureResult() {
  return {
    themes: [
      {
        themeKey: 't1',
        findingIds: ['f1'],
        category: 'accessibility' as const,
        effort: 'low' as const,
        impact: 'high' as const,
        priorityRank: 1,
      },
    ],
    quickWins: [],
    overallRisk: 'medium' as const,
    model: 'gpt-5.6-luna',
    temperature: 0,
  };
}

function writingResult() {
  return {
    output: {
      themes: [
        {
          themeKey: 't1',
          title: 'Contrastes et lisibilité',
          businessImpact:
            'Le contraste insuffisant rend certains textes difficiles à lire pour les visiteurs concernés.',
          recommendedActions: ['Augmentez le contraste des éléments concernés.'],
        },
      ],
      executiveSummary:
        'Les constats concernent principalement la lisibilité des contenus mesurés.',
      notes: '',
    },
    model: 'gpt-5.6-luna',
    temperature: 0,
    rejections: [],
    shippedStyleViolations: [],
    sanitizationWarnings: [],
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  auditDir = await mkdtemp(path.join(os.tmpdir(), 'odysseus-plan070-'));
  vi.mocked(analyzeStructure).mockResolvedValue(structureResult() as never);
  vi.mocked(analyzeWriting).mockResolvedValue(writingResult() as never);
  vi.mocked(critiqueAndRepairWriting).mockImplementation(
    async (_input, _keys, _fallback, written) => ({
      ...written,
      sanitizationWarnings: [{ code: 'critic-unresolved', field: 'themes[0](t1).businessImpact' }],
      critic: {
        record: { ran: true, issuesRaised: 2, issuesAccepted: 1, repairApplied: false },
        sidecar: {
          language: _input.language,
          model: 'gpt-5.6-luna',
          status: 'repair-discarded',
          reason: 'repaired output failed guard(s): theme title',
          issuesRaised: 2,
          dropped: {
            'invalid-shape': 0,
            'excluded-category': 1,
            'unknown-field': 0,
            'unknown-finding': 0,
            'out-of-theme-finding': 0,
            duplicate: 0,
            'over-cap': 0,
          },
          issues: [
            {
              field: 'themes[0](t1).businessImpact',
              category: 'unsupported-inference',
              findingIds: ['f1'],
              problem: PROBLEM_TEXT,
            },
          ],
          repairedFields: [],
        },
      },
    }),
  );
  vi.mocked(persistAnalysis).mockResolvedValue(undefined as never);
  vi.mocked(readAuditEvidenceDiagnostics).mockResolvedValue({
    status: 'complete',
    clientLimitations: [],
    operationalWarnings: [],
  });
});

afterEach(async () => {
  await rm(auditDir, { recursive: true, force: true });
});

describe('Plan 070 analysis-stage critic wiring', () => {
  it('runs the critic on the writer result and persists counts, not problem text', async () => {
    const result = await runAnalysisStage(
      auditDir,
      manifest(),
      [finding],
      { language: 'fr' },
      {} as never,
    );

    expect(analyzeWriting).toHaveBeenCalledTimes(1);
    expect(critiqueAndRepairWriting).toHaveBeenCalledTimes(1);
    const [criticInput, keys, , written] = vi.mocked(critiqueAndRepairWriting).mock.calls[0]!;
    expect(criticInput).toBe(vi.mocked(analyzeWriting).mock.calls[0]![0]);
    expect(keys).toEqual(['t1']);
    expect(written).toBe(await vi.mocked(analyzeWriting).mock.results[0]!.value);

    const record = { ran: true, issuesRaised: 2, issuesAccepted: 1, repairApplied: false };
    expect(result.analysis.writingCritic).toEqual(record);
    expect(result.sanitizationWarnings).toEqual([
      { code: 'critic-unresolved', field: 'themes[0](t1).businessImpact' },
    ]);

    const persisted = vi.mocked(persistAnalysis).mock.calls[0]![1];
    expect(persisted.writingCritic).toEqual(record);
    expect(JSON.stringify(persisted)).not.toContain(PROBLEM_TEXT);

    const onDisk = await readFile(result.analysisPath, 'utf-8');
    expect(JSON.parse(onDisk).writingCritic).toEqual(record);
    expect(onDisk).not.toContain(PROBLEM_TEXT);
  });

  it('writes the problem text only to the operator sidecar beside the analysis', async () => {
    const result = await runAnalysisStage(
      auditDir,
      manifest(),
      [finding],
      { language: 'fr' },
      {} as never,
    );

    const sidecarPath = criticSidecarPath(result.analysisPath);
    expect(path.basename(sidecarPath)).toMatch(/Z-fr-critic\.json$/u);
    // Every analysis lookup selects `-<lang>.json`; the sidecar never matches.
    expect(sidecarPath.endsWith('-fr.json')).toBe(false);
    const sidecar = JSON.parse(await readFile(sidecarPath, 'utf-8'));
    expect(sidecar).toMatchObject({
      analysisId: result.analysis.analysisId,
      auditId: 'audit-067',
      status: 'repair-discarded',
      issues: [{ problem: PROBLEM_TEXT }],
    });
  });

  it('sends on-demand English through the same writer and critic path', async () => {
    await runAnalysisStage(auditDir, manifest(), [finding], { language: 'en' }, {} as never);

    expect(analyzeWriting).toHaveBeenCalledTimes(1);
    expect(critiqueAndRepairWriting).toHaveBeenCalledTimes(1);
    expect(vi.mocked(critiqueAndRepairWriting).mock.calls[0]![0].language).toBe('en');
  });

  it('writes no sidecar and no critic field when the critic returns the writer result as is', async () => {
    vi.mocked(critiqueAndRepairWriting).mockImplementation(
      async (_input, _keys, _fallback, written) => written,
    );

    const result = await runAnalysisStage(
      auditDir,
      manifest(),
      [finding],
      { language: 'fr' },
      {} as never,
    );

    expect(result.analysis.writingCritic).toBeUndefined();
    expect(vi.mocked(persistAnalysis).mock.calls[0]![1]).not.toHaveProperty('writingCritic');
    const files = await readdir(path.join(auditDir, 'analyses'));
    expect(files.some((name) => name.endsWith('-critic.json'))).toBe(false);
  });
});
