import { beforeEach, describe, expect, it, vi } from 'vitest';

// Issue #559: no catalogue facts, as for an audit with no directory entry.
vi.mock('./catalogue-site-context.js', () => ({ catalogueContextOption: vi.fn(async () => ({})) }));

vi.mock('@odysseus/store', () => ({
  approveWritingCandidate: vi.fn(),
  getAuditManualFields: vi.fn(async () => undefined),
  getReportPreparation: vi.fn(),
  reconcileFailedAuditJobs: vi.fn(),
  recordFailedWritingCandidate: vi.fn(),
  recordReadyWritingCandidate: vi.fn(),
}));
vi.mock('./analysis-stage.js', () => ({ runAnalysisStage: vi.fn() }));
vi.mock('./audit-evidence.js', () => ({
  findingsAreStale: vi.fn(),
  refreshStaleAuditEvidence: vi.fn(),
}));
vi.mock('./regenerate-reports.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./regenerate-reports.js')>()),
  regenerateReportsForAudit: vi.fn(),
}));

import {
  approveWritingCandidate,
  getReportPreparation,
  reconcileFailedAuditJobs,
  recordReadyWritingCandidate,
} from '@odysseus/store';
import { runAnalysisStage } from './analysis-stage.js';
import { findingsAreStale, refreshStaleAuditEvidence } from './audit-evidence.js';
import { regenerateReportsForAudit } from './regenerate-reports.js';
import { regenerateWriting } from './regenerate-writing.js';

const auditFields = {
  auditId: 'audit-regenerate-writing',
  siteUrl: 'https://example.com/',
  startedAt: new Date('2026-09-01T00:00:00.000Z'),
};
const audit = auditFields as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(refreshStaleAuditEvidence).mockResolvedValue({
    auditDir: '/tmp/audit-regenerate-writing',
    manifest: { auditId: auditFields.auditId, siteUrl: auditFields.siteUrl } as never,
    findings: [],
    // The manifest was already repaired by an earlier failed attempt; the
    // selected writing pair is still stamped with the old normalization.
    findingsWereRefreshed: false,
  });
  vi.mocked(findingsAreStale).mockReturnValue(true);
  vi.mocked(getReportPreparation).mockResolvedValue({
    writingSelection: {
      selected: { findingsProvenance: { normalizationFingerprint: 'old' } },
    },
  } as never);
  vi.mocked(runAnalysisStage).mockResolvedValue({
    analysis: {
      analysisId: 'fr-new',
      findingsProvenance: { normalizationFingerprint: 'current' },
    },
    sanitizationWarnings: [],
  } as never);
  vi.mocked(recordReadyWritingCandidate).mockResolvedValue({
    writingSelection: { candidate: { status: 'ready' } },
  } as never);
  vi.mocked(approveWritingCandidate).mockResolvedValue({
    writingSelection: {
      candidate: { status: 'selected', approvedAt: '2026-09-01T00:01:00.000Z' },
    },
  } as never);
  vi.mocked(regenerateReportsForAudit).mockResolvedValue([{ language: 'fr' }] as never);
});

describe('writing regeneration freshness recovery', () => {
  it('regenerates the structure when the selected pair is stale after manifest repair', async () => {
    await regenerateWriting({} as never, audit, undefined);

    expect(runAnalysisStage).toHaveBeenCalledWith(
      '/tmp/audit-regenerate-writing',
      expect.anything(),
      [],
      expect.objectContaining({ language: 'fr', regenerateStructure: true }),
      expect.anything(),
    );
    expect(regenerateReportsForAudit).toHaveBeenCalledTimes(1);
  });

  it('marks the failed scan job complete once the rewritten reports exist', async () => {
    const connection = {} as never;
    await regenerateWriting(connection, audit, undefined);

    expect(reconcileFailedAuditJobs).toHaveBeenCalledWith(connection);
  });
});
