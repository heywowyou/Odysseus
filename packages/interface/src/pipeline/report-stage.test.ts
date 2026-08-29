import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/report', () => ({
  generateReportPdf: vi.fn(),
  REPORT_TEMPLATE_VERSION: 3,
}));
vi.mock('@odysseus/store', () => ({
  persistReport: vi.fn(),
  getAuditManualFields: vi.fn().mockResolvedValue(undefined),
}));

import { generateReportPdf } from '@odysseus/report';
import { persistReport } from '@odysseus/store';
import { buildFindingsProvenance, type AuditManifest } from '@odysseus/core';
import { runAllReportsStage, runReportStage } from './report-stage.js';

const fakeConnection = {} as never;

function fakeManifest(): AuditManifest {
  const findings: never[] = [];
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    findingsProvenance: buildFindingsProvenance(findings),
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
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

function fakeAnalysis() {
  const findingsProvenance = buildFindingsProvenance([]);
  return {
    analysisId: '00000000-0000-4000-8000-000000000001',
    auditId: 'audit-1',
    findingsProvenance,
    language: 'fr' as const,
    model: 'mistral-test',
    temperature: 0.2,
    generatedAt: new Date('2026-08-02T00:10:00.000Z'),
    executiveSummary: 'Summary',
    overallRisk: 'high' as const,
    themes: [],
    quickWins: [],
    notes: '',
  };
}

let auditDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  auditDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-report-stage-'));
  vi.mocked(generateReportPdf).mockResolvedValue(Buffer.from('%PDF-fake'));
  vi.mocked(persistReport).mockResolvedValue(undefined);
});

afterEach(async () => {
  await fs.rm(auditDir, { recursive: true, force: true });
});

describe('runReportStage', () => {
  it('writes the PDF under reports/ and persists a report document', async () => {
    const manifest = fakeManifest();
    const analysis = fakeAnalysis();

    const result = await runReportStage(auditDir, manifest, [], analysis, fakeConnection);

    expect(generateReportPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        auditDir,
        manifest,
        findings: [],
        analysis,
        reportId: result.reportId,
      }),
    );

    const written = await fs.readFile(result.reportPath);
    expect(written.toString()).toBe('%PDF-fake');
    expect(path.dirname(result.reportPath)).toBe(path.join(auditDir, 'reports'));
    expect(result.reportPath.endsWith('-fr.pdf')).toBe(true);
    expect(result.reportId).toEqual(expect.any(String));
    expect(result.pdfDigest).toMatch(/^sha256:[a-f0-9]{64}$/);

    const sidecar = JSON.parse(await fs.readFile(result.provenancePath, 'utf-8'));
    expect(sidecar).toEqual(
      expect.objectContaining({
        reportId: result.reportId,
        analysisId: analysis.analysisId,
        findingsProvenance: manifest.findingsProvenance,
        rendererVersion: 3,
        pdfDigest: result.pdfDigest,
      }),
    );

    expect(persistReport).toHaveBeenCalledWith(fakeConnection, {
      auditId: 'audit-1',
      reportId: result.reportId,
      analysisId: analysis.analysisId,
      findingsProvenance: manifest.findingsProvenance,
      rendererVersion: 3,
      pdfDigest: result.pdfDigest,
      language: 'fr',
      reportTemplateVersion: 3,
      analysisGeneratedAt: analysis.generatedAt,
      fileRef: path.relative(auditDir, result.reportPath),
      generatedAt: result.generatedAt,
    });
  });

  it('rejects stale analysis provenance before Chromium report generation starts', async () => {
    const manifest = fakeManifest();
    const analysis = {
      ...fakeAnalysis(),
      findingsProvenance: {
        ...fakeAnalysis().findingsProvenance,
        findingsDigest: `sha256:${'f'.repeat(64)}`,
      },
    };

    await expect(runReportStage(auditDir, manifest, [], analysis, fakeConnection)).rejects.toThrow(
      /stale analysis.*findings digest/i,
    );
    expect(generateReportPdf).not.toHaveBeenCalled();
  });

  it('names the file after the analysis language', async () => {
    const manifest = fakeManifest();
    const result = await runReportStage(
      auditDir,
      manifest,
      [],
      { ...fakeAnalysis(), language: 'en' },
      fakeConnection,
    );
    expect(result.reportPath.endsWith('-en.pdf')).toBe(true);
  });
});

describe('runAllReportsStage', () => {
  it('generates exactly two reports (fr, en), one per language', async () => {
    const manifest = fakeManifest();
    const fr = fakeAnalysis();
    const en = { ...fakeAnalysis(), language: 'en' as const };

    const results = await runAllReportsStage(auditDir, manifest, [], { fr, en }, fakeConnection);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.language)).toEqual(['fr', 'en']);
    for (const result of results) {
      expect(path.basename(result.reportPath).endsWith(`-${result.language}.pdf`)).toBe(true);
    }
    expect(generateReportPdf).toHaveBeenCalledTimes(2);
  });

  it('persists a report document for each of the two generated reports', async () => {
    const manifest = fakeManifest();
    const fr = fakeAnalysis();
    const en = { ...fakeAnalysis(), language: 'en' as const };

    await runAllReportsStage(auditDir, manifest, [], { fr, en }, fakeConnection);

    expect(persistReport).toHaveBeenCalledTimes(2);
    const persistedLanguages = vi
      .mocked(persistReport)
      .mock.calls.map(([, fields]) => fields.language);
    expect(persistedLanguages.sort()).toEqual(['en', 'fr']);
  });

  it('routes each report to runReportStage using the matching language analysis', async () => {
    const manifest = fakeManifest();
    const fr = fakeAnalysis();
    const en = { ...fakeAnalysis(), language: 'en' as const };

    await runAllReportsStage(auditDir, manifest, [], { fr, en }, fakeConnection);

    const calledLanguages = vi
      .mocked(generateReportPdf)
      .mock.calls.map(([input]) => (input as { analysis: { language: string } }).analysis.language);
    expect(calledLanguages.sort()).toEqual(['en', 'fr']);
  });
});
