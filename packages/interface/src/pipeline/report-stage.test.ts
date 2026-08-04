import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/report', () => ({
  generateReportPdf: vi.fn(),
  REPORT_TEMPLATE_VERSION: 3,
}));
vi.mock('@odysseus/store', () => ({ persistReport: vi.fn() }));

import { generateReportPdf } from '@odysseus/report';
import { persistReport } from '@odysseus/store';
import type { AuditManifest } from '@odysseus/core';
import { runReportStage } from './report-stage.js';

const fakeConnection = {} as never;

function fakeManifest(): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
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
  return {
    auditId: 'audit-1',
    language: 'fr' as const,
    model: 'claude-test',
    effort: 'medium',
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

    expect(generateReportPdf).toHaveBeenCalledWith({ auditDir, manifest, findings: [], analysis });

    const written = await fs.readFile(result.reportPath);
    expect(written.toString()).toBe('%PDF-fake');
    expect(path.dirname(result.reportPath)).toBe(path.join(auditDir, 'reports'));
    expect(result.reportPath.endsWith('-fr.pdf')).toBe(true);

    expect(persistReport).toHaveBeenCalledWith(fakeConnection, {
      auditId: 'audit-1',
      language: 'fr',
      reportTemplateVersion: 3,
      analysisGeneratedAt: analysis.generatedAt,
      fileRef: path.relative(auditDir, result.reportPath),
      generatedAt: result.generatedAt,
    });
  });

  it('names the file after the analysis language', async () => {
    const manifest = fakeManifest();
    const result = await runReportStage(auditDir, manifest, [], { ...fakeAnalysis(), language: 'en' }, fakeConnection);
    expect(result.reportPath.endsWith('-en.pdf')).toBe(true);
  });
});
