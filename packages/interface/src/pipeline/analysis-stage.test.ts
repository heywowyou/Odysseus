import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/llm')>();
  return {
    ...actual,
    analyzeStructure: vi.fn(),
    analyzeWriting: vi.fn(),
    analyzeReview: vi.fn(),
  };
});
vi.mock('@odysseus/store', () => ({ persistAnalysis: vi.fn() }));
vi.mock('./obligation-stage.js', () => ({ runObligationStage: vi.fn() }));

import { analyzeReview, analyzeStructure, analyzeWriting } from '@odysseus/llm';
import { persistAnalysis } from '@odysseus/store';
import {
  FINDINGS_SCHEMA_VERSION,
  buildFindingsProvenance,
  type AuditManifest,
  type Finding,
} from '@odysseus/core';
import { runObligationStage } from './obligation-stage.js';
import { runAnalysisStage } from './analysis-stage.js';

const fakeConnection = {} as never;

function buildFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: 'f1',
    auditId: 'audit-1',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: ['1.4.3'],
    title: 'Color contrast',
    description: 'Insufficient color contrast',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'd1',
    firstSeenAt: new Date('2026-08-02T00:00:00.000Z'),
    lastSeenAt: new Date('2026-08-02T00:00:00.000Z'),
    ...overrides,
  };
}

function fakeManifest(findings: Finding[] = [buildFinding()]): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    findingsProvenance: buildFindingsProvenance(findings),
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '130.0.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
  };
}

let auditDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  auditDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-analysis-stage-'));

  vi.mocked(analyzeStructure).mockResolvedValue({
    themes: [
      {
        themeKey: 't1',
        findingIds: ['f1'],
        category: 'accessibility',
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
      },
    ],
    quickWins: ['f1'],
    overallRisk: 'high',
    model: 'mistral-test',
    temperature: 0.2,
    unreferencedFindingCount: 0,
  });
  vi.mocked(analyzeWriting).mockResolvedValue({
    output: {
      themes: [
        {
          themeKey: 't1',
          title: 'Contrast',
          businessImpact: 'Impact',
          recommendedActions: ['Fix it'],
        },
      ],
      executiveSummary: 'Summary',
      notes: '',
    },
    model: 'mistral-test',
    temperature: 0.2,
  });
  vi.mocked(persistAnalysis).mockResolvedValue(undefined);
  vi.mocked(runObligationStage).mockResolvedValue({ status: 'undetermined', basis: [] });
  vi.mocked(analyzeReview).mockResolvedValue({
    status: 'ok',
    output: {
      themes: [
        {
          themeKey: 't1',
          businessImpact: { verdict: 'supported', reason: 'matches finding f1' },
          recommendedActions: [{ verdict: 'supported', reason: 'generic advice' }],
        },
      ],
      executiveSummary: { verdict: 'supported', reason: 'generic framing only' },
      notes: { verdict: 'supported', reason: 'empty' },
    },
    model: 'mistral-test',
    temperature: 0.2,
  });
});

afterEach(async () => {
  await fs.rm(auditDir, { recursive: true, force: true });
});

describe('runAnalysisStage', () => {
  it('generates a fresh structure pass when none exists, writes both files, and persists', async () => {
    const manifest = fakeManifest();
    const result = await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'fr' },
      fakeConnection,
    );

    expect(analyzeStructure).toHaveBeenCalledTimes(1);
    expect(result.structureReused).toBe(false);
    expect(result.usedFallbackContext).toBe(true);
    expect(result.analysis.language).toBe('fr');
    expect(result.analysis.analysisId).toEqual(expect.any(String));
    expect(result.analysis.findingsProvenance).toEqual(manifest.findingsProvenance);
    expect(result.analysis.executiveSummary).toBe('Summary');
    expect(result.unreferencedFindingCount).toBe(0);

    const analysesDir = path.join(auditDir, 'analyses');
    const files = await fs.readdir(analysesDir);
    expect(files.some((f) => f.endsWith('-structure.json'))).toBe(true);
    expect(files.some((f) => f.endsWith('-fr.json'))).toBe(true);

    expect(persistAnalysis).toHaveBeenCalledWith(
      fakeConnection,
      expect.objectContaining({
        analysisId: result.analysis.analysisId,
        auditId: 'audit-1',
        language: 'fr',
        findingsProvenance: manifest.findingsProvenance,
        executiveSummary: 'Summary',
        obligationAssessment: { status: 'undetermined', basis: [] },
      }),
    );

    const structure = JSON.parse(await fs.readFile(result.structurePath, 'utf-8'));
    const analysis = JSON.parse(await fs.readFile(result.analysisPath, 'utf-8'));
    expect(structure.findingsProvenance).toEqual(manifest.findingsProvenance);
    expect(analysis.analysisId).toBe(result.analysis.analysisId);
    expect(analysis.findingsProvenance).toEqual(manifest.findingsProvenance);
  });

  it('fails closed before an LLM call when a legacy manifest has no findings provenance', async () => {
    const manifest = fakeManifest();
    delete manifest.findingsProvenance;

    await expect(
      runAnalysisStage(auditDir, manifest, [buildFinding()], { language: 'fr' }, fakeConnection),
    ).rejects.toThrow(/legacy manifest.*normalize.*regenerate/i);
    expect(analyzeStructure).not.toHaveBeenCalled();
    expect(analyzeWriting).not.toHaveBeenCalled();
  });

  it('reuses an existing structure file for a second language call, without calling analyzeStructure again', async () => {
    const manifest = fakeManifest();
    await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'fr' },
      fakeConnection,
    );
    vi.mocked(analyzeStructure).mockClear();

    const result = await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'en' },
      fakeConnection,
    );

    expect(analyzeStructure).not.toHaveBeenCalled();
    expect(result.structureReused).toBe(true);
  });

  it('regenerateStructure forces a fresh structure pass even when one exists', async () => {
    const manifest = fakeManifest();
    await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'fr' },
      fakeConnection,
    );
    vi.mocked(analyzeStructure).mockClear();

    await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'en', regenerateStructure: true },
      fakeConnection,
    );

    expect(analyzeStructure).toHaveBeenCalledTimes(1);
  });

  it('throws loudly when a reused structure file references a finding no longer present', async () => {
    const originalFinding = buildFinding({ findingId: 'f1' });
    const manifest = fakeManifest([originalFinding]);
    await runAnalysisStage(
      auditDir,
      manifest,
      [originalFinding],
      { language: 'fr' },
      fakeConnection,
    );

    const replacement = buildFinding({ findingId: 'f2', dedupeKey: 'd2' });
    await expect(
      runAnalysisStage(
        auditDir,
        fakeManifest([replacement]),
        [replacement],
        { language: 'en' },
        fakeConnection,
      ),
    ).rejects.toThrow(/stale/);
  });

  it('computes obligationAssessment lazily via runObligationStage when not supplied, and persists it', async () => {
    const manifest = fakeManifest();
    vi.mocked(runObligationStage).mockResolvedValue({
      status: 'in_scope',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [] }],
    });

    const result = await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'fr' },
      fakeConnection,
    );

    expect(runObligationStage).toHaveBeenCalledWith(manifest, fakeConnection, undefined, undefined);
    expect(result.analysis.obligationAssessment).toEqual({
      status: 'in_scope',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [] }],
    });
    expect(persistAnalysis).toHaveBeenCalledWith(
      fakeConnection,
      expect.objectContaining({
        auditId: 'audit-1',
        executiveSummary: 'Summary',
        obligationAssessment: {
          status: 'in_scope',
          basis: [{ regimeId: 'eaa-loi-2023-171', facts: [] }],
        },
      }),
    );
  });

  it('reuses the obligationAssessment passed in options instead of calling runObligationStage', async () => {
    const manifest = fakeManifest();
    const obligationAssessment = { status: 'out_of_scope' as const, basis: [] };

    const result = await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'fr', obligationAssessment },
      fakeConnection,
    );

    expect(runObligationStage).not.toHaveBeenCalled();
    expect(result.analysis.obligationAssessment).toEqual(obligationAssessment);
  });

  it('threads manualSiren and siteSignalOverrides through to runObligationStage when obligationAssessment is not supplied', async () => {
    // Real gap found 2026-08-10 on a live haaitza.com run: the standalone
    // `odysseus audit --siren ... --override-transactional-flow ...` then
    // `odysseus analyze` two-step CLI workflow silently dropped both,
    // producing an incorrect 'undetermined' report despite the operator
    // having supplied exactly the facts needed to resolve it.
    const manifest = fakeManifest();
    vi.mocked(runObligationStage).mockResolvedValue({ status: 'in_scope', basis: [] });

    const siteSignalOverrides = {
      hasTransactionalFlow: { value: true, reason: 'phone-only booking' },
    };
    await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'fr', manualSiren: '498173988', siteSignalOverrides },
      fakeConnection,
    );

    expect(runObligationStage).toHaveBeenCalledWith(
      manifest,
      fakeConnection,
      '498173988',
      siteSignalOverrides,
    );
  });

  it('reports usedFallbackContext: false when an explicit siteContext is passed', async () => {
    const manifest = fakeManifest();
    const result = await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      {
        language: 'fr',
        siteContext: {
          businessType: 'wine estate',
          primaryGoal: 'leads',
          languagesServed: ['fr'],
          targetMarkets: ['FR'],
        },
      },
      fakeConnection,
    );

    expect(result.usedFallbackContext).toBe(false);
  });

  it('runs the shadow reviewer after persisting and writes a review file next to the analysis', async () => {
    const manifest = fakeManifest();
    const result = await runAnalysisStage(
      auditDir,
      manifest,
      [buildFinding()],
      { language: 'fr' },
      fakeConnection,
    );

    expect(analyzeReview).toHaveBeenCalledTimes(1);
    expect(analyzeReview).toHaveBeenCalledWith(
      expect.objectContaining({
        writingInput: expect.objectContaining({ language: 'fr' }),
        written: expect.objectContaining({ executiveSummary: 'Summary' }),
      }),
    );

    const files = await fs.readdir(path.join(auditDir, 'analyses'));
    expect(files.some((f) => f.endsWith('-review.json'))).toBe(true);

    const reviewFile = files.find((f) => f.endsWith('-review.json'))!;
    const review = JSON.parse(
      await fs.readFile(path.join(auditDir, 'analyses', reviewFile), 'utf-8'),
    );
    expect(review.auditId).toBe('audit-1');
    expect(review.language).toBe('fr');
    expect(review.analysisId).toBe(result.analysis.analysisId);
    expect(review.reviews.themes[0].themeKey).toBe('t1');
  });

  it('still writes and persists the analysis when the reviewer is skipped', async () => {
    const manifest = fakeManifest();
    vi.mocked(analyzeReview).mockResolvedValueOnce({
      status: 'skipped',
      reason: 'HTTP 429',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await runAnalysisStage(
        auditDir,
        manifest,
        [buildFinding()],
        { language: 'fr' },
        fakeConnection,
      );

      expect(result.analysisPath).toBeDefined();
      expect(persistAnalysis).toHaveBeenCalledTimes(1);
      const files = await fs.readdir(path.join(auditDir, 'analyses'));
      expect(files.some((f) => f.endsWith('-fr.json'))).toBe(true);
      expect(files.some((f) => f.endsWith('-review.json'))).toBe(false);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('skipped - HTTP 429'));
    } finally {
      warn.mockRestore();
    }
  });

  it('does not let a reviewer exception block the analysis', async () => {
    const manifest = fakeManifest();
    vi.mocked(analyzeReview).mockRejectedValueOnce(new Error('unexpected'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const result = await runAnalysisStage(
        auditDir,
        manifest,
        [buildFinding()],
        { language: 'fr' },
        fakeConnection,
      );

      expect(result.analysis.executiveSummary).toBe('Summary');
      expect(persistAnalysis).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('unexpected'));
    } finally {
      warn.mockRestore();
    }
  });
});
