import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./catalogue-site-context.js', () => ({
  catalogueContextOption: vi.fn(async () => ({ catalogueContext: { commune: 'Antibes' } })),
}));
vi.mock('./analysis-stage.js', () => ({ runAnalysisStage: vi.fn() }));
vi.mock('@odysseus/store', () => ({
  approveWritingCandidate: vi.fn(),
  getAuditManualFields: vi.fn(),
  recordReadyWritingCandidate: vi.fn(),
}));

import {
  approveWritingCandidate,
  getAuditManualFields,
  recordReadyWritingCandidate,
} from '@odysseus/store';
import { runAnalysisStage } from './analysis-stage.js';
import { WritingSelectionFailedError, writeSelectedAnalysis } from './write-selected-analysis.js';

const connection = {} as never;
const findingsProvenance = {
  findingsSchemaVersion: 1 as const,
  normalizationFingerprint: 'fingerprint',
  findingsDigest: 'digest',
};
const input = {
  auditDir: '/artifacts/example.com/dir',
  manifest: { auditId: 'audit-1' } as never,
  findings: [],
  findingsProvenance,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuditManualFields).mockResolvedValue(undefined);
  vi.mocked(runAnalysisStage).mockResolvedValue({
    analysis: { analysisId: 'analysis-fr', findingsProvenance },
    sanitizationWarnings: [],
  } as never);
  vi.mocked(recordReadyWritingCandidate).mockResolvedValue({
    writingSelection: { candidate: { status: 'ready' } },
  } as never);
  vi.mocked(approveWritingCandidate).mockResolvedValue({
    writingSelection: { candidate: { status: 'selected', approvedAt: '2026-09-29T10:00:00Z' } },
  } as never);
});

describe('writeSelectedAnalysis (issue #568)', () => {
  it('writes French from the stored manual fields and catalogue context, then selects it', async () => {
    vi.mocked(getAuditManualFields).mockResolvedValue({
      siren: { value: '552100554' },
      transactionalFlowOverride: { value: true, reason: 'Réservation en ligne' },
    } as never);

    const result = await writeSelectedAnalysis(connection, { ...input, regenerateStructure: true });

    expect(runAnalysisStage).toHaveBeenCalledWith(
      input.auditDir,
      input.manifest,
      input.findings,
      {
        language: 'fr',
        findingsProvenance,
        catalogueContext: { commune: 'Antibes' },
        regenerateStructure: true,
        manualSiren: '552100554',
        siteSignalOverrides: {
          hasTransactionalFlow: { value: true, reason: 'Réservation en ligne' },
        },
      },
      connection,
    );
    expect(recordReadyWritingCandidate).toHaveBeenCalledWith(
      connection,
      'audit-1',
      { frAnalysisId: 'analysis-fr', findingsProvenance },
      [],
    );
    expect(result).toMatchObject({
      pair: { frAnalysisId: 'analysis-fr' },
      approvedAt: '2026-09-29T10:00:00Z',
    });
  });

  it('throws when the candidate is not recorded as ready, before approving', async () => {
    vi.mocked(recordReadyWritingCandidate).mockResolvedValue({ writingSelection: {} } as never);
    const onAnalysed = vi.fn();

    const failure = writeSelectedAnalysis(connection, { ...input, onAnalysed });

    await expect(failure).rejects.toBeInstanceOf(WritingSelectionFailedError);
    await expect(failure).rejects.toMatchObject({
      failure: 'not-ready',
      frAnalysisId: 'analysis-fr',
    });
    expect(onAnalysed).toHaveBeenCalledWith('analysis-fr');
    expect(approveWritingCandidate).not.toHaveBeenCalled();
  });

  it('throws when the ready candidate is not selected', async () => {
    vi.mocked(approveWritingCandidate).mockResolvedValue({
      writingSelection: { candidate: { status: 'ready' } },
    } as never);

    await expect(writeSelectedAnalysis(connection, input)).rejects.toMatchObject({
      name: 'WritingSelectionFailedError',
      failure: 'not-selected',
    });
  });
});
