import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFindingsProvenance } from '@odysseus/core';

vi.mock('@odysseus/store', () => ({
  approveWritingCandidate: vi.fn(),
  attachEnglishAnalysisToSelection: vi.fn(),
  getReportPreparation: vi.fn(),
  recordReadyWritingCandidate: vi.fn(),
  resolveSelectedAnalysisPairForAudit: vi.fn(),
}));
vi.mock('./analysis-stage.js', () => ({ runAnalysisStage: vi.fn() }));
vi.mock('./audit-evidence.js', () => ({
  findingsAreStale: vi.fn(() => false),
  refreshStaleAuditEvidence: vi.fn(),
}));
vi.mock('./report-stage.js', () => ({ runReportStage: vi.fn() }));

import {
  approveWritingCandidate,
  attachEnglishAnalysisToSelection,
  getReportPreparation,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
} from '@odysseus/store';
import { runAnalysisStage } from './analysis-stage.js';
import { findingsAreStale, refreshStaleAuditEvidence } from './audit-evidence.js';
import { runReportStage } from './report-stage.js';
import { generateEnglishVersion } from './generate-english-version.js';

const provenance = buildFindingsProvenance([]);
const selectedFrench = {
  analysisId: 'fr-selected',
  auditId: 'audit-067-en',
  language: 'fr' as const,
  findingsProvenance: provenance,
  generatedAt: new Date('2026-09-01T00:00:00Z'),
  structureGeneratedAt: '2026-09-01T00:00:00.000Z',
};
const audit = {
  auditId: 'audit-067-en',
  siteUrl: 'https://example.com/',
  startedAt: new Date('2026-09-01T00:00:00Z'),
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveSelectedAnalysisPairForAudit).mockResolvedValue({
    kind: 'selected',
    fr: selectedFrench,
  } as never);
  vi.mocked(getReportPreparation).mockResolvedValue({
    writingSelection: {
      selected: {
        frAnalysisId: selectedFrench.analysisId,
        findingsProvenance: provenance,
      },
    },
    updatedAt: '2026-09-01T00:00:00.000Z',
  });
  vi.mocked(refreshStaleAuditEvidence).mockResolvedValue({
    auditDir: '/tmp/audit-067-en',
    manifest: { auditId: 'audit-067-en', siteUrl: 'https://example.com/' } as never,
    findings: [],
    findingsWereRefreshed: false,
  });
  vi.mocked(runAnalysisStage).mockResolvedValue({
    analysis: {
      analysisId: 'en-new',
      auditId: 'audit-067-en',
      language: 'en',
      findingsProvenance: provenance,
      structureGeneratedAt: selectedFrench.structureGeneratedAt,
    },
    sanitizationWarnings: [],
  } as never);
  vi.mocked(attachEnglishAnalysisToSelection).mockResolvedValue(undefined as never);
  vi.mocked(runReportStage).mockResolvedValue({
    reportId: 'report-en',
    reportPath: '/tmp/report-en.pdf',
    provenancePath: '/tmp/report-en.pdf.provenance.json',
    pdfDigest: 'sha256:en',
    generatedAt: new Date('2026-09-01T00:02:00Z'),
    pageCount: 20,
  });
});

describe('Plan 067 on-demand English generation', () => {
  it('uses one English analysis stage against the exact French structure and leaves the French analysis ID unchanged', async () => {
    const result = await generateEnglishVersion({} as never, audit);

    expect(runAnalysisStage).toHaveBeenCalledTimes(1);
    expect(runAnalysisStage).toHaveBeenCalledWith(
      '/tmp/audit-067-en',
      expect.anything(),
      [],
      expect.objectContaining({
        language: 'en',
        regenerateWriting: true,
        requiredStructureGeneratedAt: selectedFrench.structureGeneratedAt,
      }),
      expect.anything(),
    );
    expect(attachEnglishAnalysisToSelection).toHaveBeenCalledWith(
      expect.anything(),
      'audit-067-en',
      'en-new',
      [],
    );
    expect(recordReadyWritingCandidate).not.toHaveBeenCalled();
    expect(approveWritingCandidate).not.toHaveBeenCalled();
    expect(result.frAnalysisId).toBe('fr-selected');
    expect(result.enAnalysisId).toBe('en-new');
    expect(runReportStage).toHaveBeenCalledTimes(1);
  });

  it('leaves the French report selection untouched when English writing fails', async () => {
    vi.mocked(runAnalysisStage).mockRejectedValueOnce(new Error('English provider failed'));

    await expect(generateEnglishVersion({} as never, audit)).rejects.toThrow(
      'English provider failed',
    );

    expect(attachEnglishAnalysisToSelection).not.toHaveBeenCalled();
    expect(recordReadyWritingCandidate).not.toHaveBeenCalled();
    expect(approveWritingCandidate).not.toHaveBeenCalled();
    expect(runReportStage).not.toHaveBeenCalled();
  });

  it('leaves the selected writing untouched when English PDF rendering fails', async () => {
    vi.mocked(runReportStage).mockRejectedValueOnce(new Error('English PDF failed'));

    await expect(generateEnglishVersion({} as never, audit)).rejects.toThrow('English PDF failed');

    expect(runAnalysisStage).toHaveBeenCalledTimes(1);
    expect(runReportStage).toHaveBeenCalledTimes(1);
    expect(attachEnglishAnalysisToSelection).not.toHaveBeenCalled();
    expect(recordReadyWritingCandidate).not.toHaveBeenCalled();
    expect(approveWritingCandidate).not.toHaveBeenCalled();
  });

  it('refuses to attach English to a French analysis made from stale findings', async () => {
    vi.mocked(findingsAreStale).mockReturnValueOnce(true);

    await expect(generateEnglishVersion({} as never, audit)).rejects.toThrow(
      'selected French report is out of date',
    );

    expect(runAnalysisStage).not.toHaveBeenCalled();
    expect(attachEnglishAnalysisToSelection).not.toHaveBeenCalled();
    expect(runReportStage).not.toHaveBeenCalled();
  });

  it('attaches English only after the English PDF has rendered successfully', async () => {
    await generateEnglishVersion({} as never, audit);

    expect(vi.mocked(runReportStage).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(attachEnglishAnalysisToSelection).mock.invocationCallOrder[0]!,
    );
  });
});
