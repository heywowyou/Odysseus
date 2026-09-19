import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
  analyzeReview: vi.fn(),
  analyzeCorrectionReview: vi.fn(),
}));

import {
  analyzeCorrectionReview,
  analyzeReview,
  analyzeStructure,
  analyzeWriting,
} from '@odysseus/llm';
import { persistAnalysis } from '@odysseus/store';
import { readAuditEvidenceDiagnostics } from './audit-evidence-diagnostics.js';
import { runAnalysisStage } from './analysis-stage.js';

let auditDir: string;

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
  auditDir = await mkdtemp(path.join(os.tmpdir(), 'odysseus-plan067-'));
  vi.mocked(analyzeStructure).mockResolvedValue(structureResult() as never);
  vi.mocked(analyzeWriting).mockResolvedValue(writingResult() as never);
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

describe('Plan 067 analysis-stage provider budget', () => {
  it('uses exactly structure + French writer on a fresh model-backed report and never advisory reviewers', async () => {
    const result = await runAnalysisStage(
      auditDir,
      manifest(),
      [finding],
      { language: 'fr' },
      {} as never,
    );

    expect(result.structureReused).toBe(false);
    expect(analyzeStructure).toHaveBeenCalledTimes(1);
    expect(analyzeWriting).toHaveBeenCalledTimes(1);
    expect(analyzeReview).not.toHaveBeenCalled();
    expect(analyzeCorrectionReview).not.toHaveBeenCalled();
  });

  it('threads deterministic limitations into the same single writer call', async () => {
    vi.mocked(readAuditEvidenceDiagnostics).mockResolvedValue({
      status: 'limited',
      clientLimitations: [
        {
          limitationId: 'limitation:site-level',
          code: 'site-level-unknown',
          summary: {
            fr: 'Une vérification au niveau du site est indisponible.',
            en: 'A site-level check is unavailable.',
          },
          reportDestination: 'section-11',
          evidenceRefs: ['site:security-headers'],
        },
      ],
      operationalWarnings: [{ code: 'environment-unapproved', referenceCount: 1 }],
    });

    await runAnalysisStage(auditDir, manifest(), [finding], { language: 'fr' }, {} as never);

    expect(analyzeWriting).toHaveBeenCalledTimes(1);
    const input = vi.mocked(analyzeWriting).mock.calls[0]?.[0];
    expect(input?.summaryEvidence.limitations).toContain(
      'Une vérification au niveau du site est indisponible.',
    );
    expect(JSON.stringify(input?.summaryEvidence)).not.toContain('environment-unapproved');
    expect(analyzeReview).not.toHaveBeenCalled();
    expect(analyzeCorrectionReview).not.toHaveBeenCalled();
  });

  it('uses exactly one French writer call when a compatible structure already exists', async () => {
    const m = manifest();
    const provenance = buildFindingsProvenance([finding]);
    await mkdir(path.join(auditDir, 'analyses'), { recursive: true });
    await writeFile(
      path.join(auditDir, 'analyses', '2026-09-01T00-00-00Z-structure.json'),
      JSON.stringify({
        auditId: 'audit-067',
        ...structureResult(),
        generatedAt: '2026-09-01T00:00:00.000Z',
        findingsProvenance: provenance,
      }),
    );

    const result = await runAnalysisStage(
      auditDir,
      m,
      [finding],
      { language: 'fr', regenerateWriting: true },
      {} as never,
    );

    expect(result.structureReused).toBe(true);
    expect(analyzeStructure).not.toHaveBeenCalled();
    expect(analyzeWriting).toHaveBeenCalledTimes(1);
    expect(analyzeReview).not.toHaveBeenCalled();
    expect(analyzeCorrectionReview).not.toHaveBeenCalled();
  });
});
