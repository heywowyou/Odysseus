import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Only generateReportPdf is faked; the page-count warning helper is the
 *  real pure function, so the stage's threshold behavior is exercised
 *  against the report package's own implementation. */
vi.mock('@odysseus/report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/report')>();
  return {
    ...actual,
    generateReportPdf: vi.fn(),
    REPORT_TEMPLATE_VERSION: 3,
  };
});
vi.mock('@odysseus/store', () => ({
  persistReport: vi.fn(),
  getAuditManualFields: vi.fn().mockResolvedValue(undefined),
  getReportPreparation: vi.fn().mockResolvedValue({
    context: {},
    stakeholders: {},
    journeyDecisions: [],
    updatedAt: '2026-09-01T00:00:00.000Z',
  }),
}));
/** runAllReportsStage launches one browser to share across both language
 *  passes (issue #6); generateReportPdf itself is fully mocked below and
 *  never touches it, so a fake with a no-op close() is enough here. */
vi.mock('@odysseus/scanner', () => ({
  readOdysseusBuildId: vi.fn(() => 'render-build'),
  launchBrowser: vi.fn(async () => ({ browser: { close: vi.fn() }, debugPort: 0 })),
}));

import { generateReportPdf } from '@odysseus/report';
import { launchBrowser } from '@odysseus/scanner';
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
    model: 'openai-test',
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
  vi.mocked(generateReportPdf).mockResolvedValue({
    pdf: Buffer.from('%PDF-fake'),
    pageCount: 44,
  });
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
        renderMetadata: expect.objectContaining({
          reportId: result.reportId,
          rendererBuild: 'render-build',
          templateVersion: 3,
          renderedAt: result.generatedAt,
        }),
      }),
    );

    const written = await fs.readFile(result.reportPath);
    expect(written.toString()).toBe('%PDF-fake');
    expect(path.dirname(result.reportPath)).toBe(path.join(auditDir, 'reports'));
    expect(result.reportPath.endsWith('-fr.pdf')).toBe(true);
    expect(result.reportId).toEqual(expect.any(String));
    expect(result.pdfDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.pageCount).toBe(44);
    expect(result.pageCountWarning).toBeUndefined();

    const sidecar = JSON.parse(await fs.readFile(result.provenancePath, 'utf-8'));
    expect(sidecar).toEqual(
      expect.objectContaining({
        reportId: result.reportId,
        analysisId: analysis.analysisId,
        findingsProvenance: manifest.findingsProvenance,
        rendererVersion: 3,
        rendererBuild: 'render-build',
        reportTemplateVersion: 3,
        pdfDigest: result.pdfDigest,
        pageCount: 44,
      }),
    );

    expect(persistReport).toHaveBeenCalledWith(fakeConnection, {
      auditId: 'audit-1',
      reportId: result.reportId,
      analysisId: analysis.analysisId,
      findingsProvenance: manifest.findingsProvenance,
      rendererVersion: 3,
      rendererBuild: 'render-build',
      pdfDigest: result.pdfDigest,
      pageCount: 44,
      language: 'fr',
      reportTemplateVersion: 3,
      analysisGeneratedAt: analysis.generatedAt,
      fileRef: path.relative(auditDir, result.reportPath),
      generatedAt: result.generatedAt,
      // Issue #62: names the machine whose artifacts root holds the file.
      renderedOnHost: os.hostname(),
    });
  });

  it('carries no length warning at exactly the 60 page threshold', async () => {
    vi.mocked(generateReportPdf).mockResolvedValue({
      pdf: Buffer.from('%PDF-fake'),
      pageCount: 60,
    });

    const result = await runReportStage(
      auditDir,
      fakeManifest(),
      [],
      fakeAnalysis(),
      fakeConnection,
    );

    expect(result.pageCount).toBe(60);
    expect(result.pageCountWarning).toBeUndefined();
  });

  it('warns above 60 pages while still persisting the report and its page count', async () => {
    vi.mocked(generateReportPdf).mockResolvedValue({
      pdf: Buffer.from('%PDF-fake'),
      pageCount: 61,
    });
    const analysis = fakeAnalysis();

    const result = await runReportStage(auditDir, fakeManifest(), [], analysis, fakeConnection);

    expect(result.pageCount).toBe(61);
    expect(result.pageCountWarning).toEqual({ pageCount: 61, threshold: 60 });

    const persisted = vi.mocked(persistReport).mock.calls[0]?.[1];
    expect(persisted?.pageCount).toBe(61);

    const sidecar = JSON.parse(await fs.readFile(result.provenancePath, 'utf-8'));
    expect(sidecar['pageCount']).toBe(61);
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
      expect(result.pageCount).toBe(44);
      expect(result.pageCountWarning).toBeUndefined();
    }
    expect(generateReportPdf).toHaveBeenCalledTimes(2);
  });

  // Issue #6: the fr and en passes used to each launch and close their own
  // Chromium instance inside generateReportPdf, roughly doubling report
  // wall time for a cost that has nothing to do with either language.
  it('launches Chromium once and shares it across both language passes', async () => {
    const manifest = fakeManifest();
    const fr = fakeAnalysis();
    const en = { ...fakeAnalysis(), language: 'en' as const };

    await runAllReportsStage(auditDir, manifest, [], { fr, en }, fakeConnection);

    expect(launchBrowser).toHaveBeenCalledTimes(1);
    const { browser } = await vi.mocked(launchBrowser).mock.results[0]!.value;
    const passedBrowsers = vi.mocked(generateReportPdf).mock.calls.map(([input]) => input.browser);
    expect(passedBrowsers).toEqual([browser, browser]);
    expect(browser.close).toHaveBeenCalledTimes(1);
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
