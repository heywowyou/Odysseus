import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { findDeltaBaseline } from './findings-delta-baseline.js';
import {
  deleteAnalysesById,
  deleteReportBundlesById,
  deleteReportsById,
  getAuditSlimmedAt,
  getLatestRetentionRun,
  listRetentionJobRefs,
  loadRetentionSnapshot,
  markAuditSlimmed,
  persistRetentionRun,
} from './retention.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(scopedMongoTestUri('retention'));

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

const NOW = new Date('2026-10-01T00:00:00Z');
const DAY = 86_400_000;

async function insert(collection: string, docs: Record<string, unknown>[]): Promise<void> {
  await connection!.db!.collection(collection).insertMany(docs as never[]);
}

const provenance = {
  findingsSchemaVersion: 1,
  normalizationFingerprint: 'fp',
  findingsDigest: 'sha256:abc',
};

describe.skipIf(!available)('retention store', () => {
  beforeEach(async () => {
    await connection!.dropDatabase();
  });

  it('loads the projections the policy reads, including legacy report rows', async () => {
    await insert('audits', [
      {
        auditId: 'a1',
        siteUrl: 'https://hotel.example/',
        kind: 'audit',
        scanIntent: 'full-audit',
        startedAt: new Date(NOW.getTime() - 30 * DAY),
        finishedAt: new Date(NOW.getTime() - 30 * DAY),
        findingsProvenance: provenance,
        prospectId: 'p1',
        reportPreparation: {
          updatedAt: NOW.toISOString(),
          writingSelection: { selected: { frAnalysisId: 'an1', findingsProvenance: provenance } },
        },
      },
      {
        auditId: 'legacy',
        siteUrl: 'https://hotel.example/',
        kind: 'audit',
        startedAt: new Date(NOW.getTime() - 60 * DAY),
        finishedAt: new Date(NOW.getTime() - 60 * DAY),
      },
    ]);
    await insert('reports', [
      {
        reportId: 'r1',
        auditId: 'a1',
        analysisId: 'an1',
        language: 'fr',
        generatedAt: NOW,
        fileRef: 'reports/r1-fr.pdf',
        variants: { light: { fileRef: 'reports/r1-fr-clair.pdf', pdfDigest: 'x' } },
      },
      {
        reportId: 'r2',
        auditId: 'a1',
        analysisId: 'an1',
        language: 'fr',
        origin: 'finalized',
        finalization: { supersedesReportId: 'r1' },
        generatedAt: NOW,
        fileRef: 'reports/final-fr.pdf',
      },
      { auditId: 'legacy', language: 'fr', generatedAt: NOW, fileRef: 'reports/legacy.pdf' },
    ]);
    await insert('reportApprovals', [
      { approvalId: 'ap', auditId: 'a1', fr: { reportId: 'r1' }, en: { reportId: 'r3' } },
    ]);
    await insert('outreach_previews', [
      {
        previewId: 'live',
        auditId: 'a1',
        status: 'live',
        expiresAt: new Date(NOW.getTime() + DAY),
      },
      {
        previewId: 'rev',
        auditId: 'a2',
        status: 'revoked',
        expiresAt: new Date(NOW.getTime() + DAY),
      },
      { previewId: 'exp', auditId: 'a3', status: 'live', expiresAt: new Date(NOW.getTime() - DAY) },
    ]);
    await insert('prospects', [
      { prospectId: 'p1', name: 'Live' },
      { prospectId: 'p2', name: 'Archived', archivedAt: NOW },
    ]);

    const snapshot = await loadRetentionSnapshot(connection!, NOW);

    const byId = new Map(snapshot.audits.map((audit) => [audit.auditId, audit]));
    expect(byId.get('a1')).toMatchObject({
      hasFindingsProvenance: true,
      scanIntent: 'full-audit',
      prospectId: 'p1',
      writingSelection: { selected: { frAnalysisId: 'an1' } },
    });
    expect(byId.get('legacy')).toMatchObject({ hasFindingsProvenance: false });
    expect(byId.get('legacy')).not.toHaveProperty('scanIntent');
    expect(snapshot.reports).toHaveLength(3);
    expect(snapshot.reports.find((row) => row.reportId === 'r1')).toMatchObject({
      origin: 'pipeline',
      lightFileRef: 'reports/r1-fr-clair.pdf',
    });
    expect(snapshot.reports.find((row) => row.reportId === 'r2')).toMatchObject({
      origin: 'finalized',
      supersedesReportId: 'r1',
    });
    expect(snapshot.reports.find((row) => row.auditId === 'legacy')?.rowId).toMatch(
      /^[0-9a-f]{24}$/u,
    );
    expect(snapshot.approvals).toEqual([{ auditId: 'a1', reportIds: ['r1', 'r3'] }]);
    expect(snapshot.livePreviewAuditIds).toEqual(['a1']);
    expect(snapshot.archivedProspectIds).toEqual(['p2']);
  });

  it('deletes only the named report and analysis rows', async () => {
    await insert('reports', [
      { reportId: 'keep', auditId: 'a1', language: 'fr', generatedAt: NOW, fileRef: 'k.pdf' },
      { auditId: 'a1', language: 'fr', generatedAt: NOW, fileRef: 'legacy.pdf' },
    ]);
    await insert('analyses', [
      { analysisId: 'gone', auditId: 'a1', language: 'fr', generatedAt: NOW },
      { analysisId: 'kept', auditId: 'a1', language: 'fr', generatedAt: NOW },
    ]);
    const { reports } = await loadRetentionSnapshot(connection!, NOW);
    const legacy = reports.find((row) => row.reportId === undefined)!;

    expect(await deleteReportsById(connection!, [legacy.rowId])).toBe(1);
    expect(await deleteAnalysesById(connection!, ['gone'])).toBe(1);

    const after = await loadRetentionSnapshot(connection!, NOW);
    expect(after.reports.map((row) => row.reportId)).toEqual(['keep']);
    expect(after.analyses.map((row) => row.analysisId)).toEqual(['kept']);
  });

  it('never deletes an active, operator-approved or promoted bundle', async () => {
    const bundle = (bundleId: string, state: string) => ({
      bundleId,
      bundleDigest: bundleId,
      auditId: 'a1',
      qualityRunId: 'q',
      state,
      createdAt: NOW,
    });
    await insert('reportBundles', [
      bundle('stale', 'quality-approved'),
      bundle('active', 'quality-approved'),
      bundle('approved', 'operator-approved'),
      bundle('promoted', 'promoted'),
    ]);
    await insert('activeReportBundles', [{ auditId: 'a1', bundleId: 'active', qualityRunId: 'q' }]);

    const deleted = await deleteReportBundlesById(connection!, [
      'stale',
      'active',
      'approved',
      'promoted',
    ]);

    expect(deleted).toBe(1);
    const left = await loadRetentionSnapshot(connection!, NOW);
    expect(left.bundles.map((row) => row.bundleId).sort()).toEqual([
      'active',
      'approved',
      'promoted',
    ]);
  });

  it('marks an audit slimmed and keeps it usable as the findings-delta baseline', async () => {
    await insert('audits', [
      {
        auditId: 'delivered',
        siteUrl: 'https://hotel.example/',
        kind: 'audit',
        startedAt: new Date(NOW.getTime() - 30 * DAY),
        finishedAt: new Date(NOW.getTime() - 30 * DAY),
        findingsProvenance: provenance,
        tool: { odysseusVersion: '1' },
        config: { maxPages: 10, maxDepth: 2 },
      },
    ]);
    await insert('findings', [{ auditId: 'delivered', findingId: 'f1', ruleId: 'image-alt' }]);
    await insert('reportApprovals', [
      { approvalId: 'ap', auditId: 'delivered', fr: { reportId: 'r1' } },
    ]);

    await markAuditSlimmed(connection!, 'delivered', NOW);

    expect(await getAuditSlimmedAt(connection!, 'delivered')).toEqual(NOW);
    expect(await getAuditSlimmedAt(connection!, 'missing')).toBeUndefined();
    const baseline = await findDeltaBaseline(connection!, {
      siteUrl: 'https://hotel.example/',
      startedAt: NOW,
    });
    expect(baseline?.auditId).toBe('delivered');
    expect(baseline?.findings.map((finding) => finding.findingId)).toEqual(['f1']);
  });

  it('lists the audits every job that can still write names', async () => {
    await insert('jobs', [
      { jobId: 'running', status: 'running', auditId: 'a1', urlResults: [{ auditId: 'a2' }] },
      { jobId: 'queued-batch', status: 'queued', auditIds: ['a3'] },
      { jobId: 'done', status: 'complete', auditId: 'a4' },
      { jobId: 'stopping', status: 'cancelled', auditId: 'a5' },
    ]);

    const refs = await listRetentionJobRefs(connection!, ['stopping']);

    expect(Object.fromEntries(refs.map((ref) => [ref.jobId, ref.auditIds.sort()]))).toEqual({
      running: ['a1', 'a2'],
      'queued-batch': ['a3'],
      stopping: ['a5'],
    });
  });

  it('records a run that expires after 90 days and reads back the latest one', async () => {
    const base = {
      trigger: 'cli' as const,
      counts: {
        auditsDeleted: 1,
        auditsSlimmed: 0,
        reportsDeleted: 2,
        analysesDeleted: 0,
        structureFilesDeleted: 0,
        qualityCandidateSetsDeleted: 0,
        reportBundlesDeleted: 0,
        auditsHeld: 0,
      },
      bytesReclaimed: { local: 10, remote: 5 },
      remoteObjectsDeleted: 3,
      failures: [],
    };
    await persistRetentionRun(connection!, {
      ...base,
      startedAt: new Date(NOW.getTime() - DAY),
      finishedAt: new Date(NOW.getTime() - DAY),
    });
    const latest = await persistRetentionRun(connection!, {
      ...base,
      startedAt: NOW,
      finishedAt: NOW,
      failures: [{ auditId: 'a1', step: 'remote', message: 'bucket unavailable' }],
    });

    expect(latest.expiresAt).toEqual(new Date(NOW.getTime() + 90 * DAY));
    expect(await getLatestRetentionRun(connection!)).toMatchObject({
      runId: latest.runId,
      failures: [{ auditId: 'a1', step: 'remote' }],
    });
  });
});
