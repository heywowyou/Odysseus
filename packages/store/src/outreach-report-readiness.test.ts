import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  findAuditsWithUnreadyReports,
  loadOutreachReportReadiness,
  resolveOutreachReportReadiness,
  type ReadinessReport,
} from './outreach-report-readiness.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const provenance = {
  findingsSchemaVersion: 1 as const,
  normalizationFingerprint: 'fingerprint-current',
  findingsDigest: 'digest-current',
};
const staleProvenance = { ...provenance, findingsDigest: 'digest-before-renormalization' };

const audit = {
  auditId: 'audit-cap',
  startedAt: new Date('2026-09-16T10:00:00.000Z'),
  findingsProvenance: provenance,
};

function report(language: 'fr' | 'en', overrides: Partial<ReadinessReport> = {}): ReadinessReport {
  const auditId = overrides.auditId ?? audit.auditId;
  return {
    auditId,
    language,
    generatedAt: new Date('2026-09-16T11:00:00.000Z'),
    findingsProvenance: provenance,
    analysisId: `${auditId}-${language}`,
    ...overrides,
  };
}

/** The analysis a report of the same audit and language was rendered from. */
function analysis(auditId: string, language: 'fr' | 'en', analysisId = `${auditId}-${language}`) {
  return {
    analysisId,
    auditId,
    language,
    generatedAt: new Date('2026-09-16T10:30:00.000Z'),
    findingsProvenance: provenance,
  };
}

describe('resolveOutreachReportReadiness (issue #388)', () => {
  it('is ready with a current FR and EN report for the audit', () => {
    expect(resolveOutreachReportReadiness(audit, [report('fr'), report('en')], [])).toEqual({
      state: 'ready',
    });
  });

  it('is ready with a current French report alone, English being an optional attachment', () => {
    expect(resolveOutreachReportReadiness(audit, [report('fr')], [])).toEqual({ state: 'ready' });
    expect(
      resolveOutreachReportReadiness(
        audit,
        [report('fr'), report('en', { findingsProvenance: staleProvenance })],
        [],
      ),
    ).toEqual({ state: 'ready' });
  });

  it('names a report-stage failure when the job failed after the audit was saved', () => {
    // Cap d'Antibes: the PDF gate refused the French render.
    const failed = {
      auditId: audit.auditId,
      status: 'failed' as const,
      createdAt: audit.startedAt,
    };
    expect(resolveOutreachReportReadiness(audit, [], [failed])).toEqual({
      state: 'not-ready',
      reason: 'failed',
    });
  });

  it('is stale when the newest report of a language no longer matches the audit', () => {
    const olderCurrent = report('fr', { generatedAt: new Date('2026-09-16T09:00:00.000Z') });
    const newerStale = report('fr', { findingsProvenance: staleProvenance });
    expect(
      resolveOutreachReportReadiness(audit, [olderCurrent, newerStale, report('en')], []),
    ).toEqual({ state: 'not-ready', reason: 'stale' });
  });

  it('is missing without a French report, including historical audits', () => {
    expect(resolveOutreachReportReadiness(audit, [report('en')], [])).toEqual({
      state: 'not-ready',
      reason: 'missing',
    });
    expect(resolveOutreachReportReadiness(audit, [], [])).toEqual({
      state: 'not-ready',
      reason: 'missing',
    });
  });

  it('ignores reports of another audit', () => {
    expect(
      resolveOutreachReportReadiness(
        audit,
        [report('fr', { auditId: 'audit-other' }), report('en', { auditId: 'audit-other' })],
        [],
      ),
    ).toEqual({ state: 'not-ready', reason: 'missing' });
  });

  it('keeps the issue #378 needs-input rules, even over a ready pair', () => {
    const reports = [report('fr'), report('en')];
    const onAudit = {
      auditId: audit.auditId,
      status: 'needs-input' as const,
      createdAt: new Date('2026-09-16T09:59:00.000Z'),
    };
    const newerRun = {
      auditId: 'audit-newer',
      status: 'needs-input' as const,
      createdAt: new Date('2026-09-17T10:00:00.000Z'),
    };
    const superseded = {
      auditId: 'audit-ancient',
      status: 'needs-input' as const,
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
    };
    for (const job of [onAudit, newerRun]) {
      expect(resolveOutreachReportReadiness(audit, reports, [job])).toEqual({
        state: 'not-ready',
        reason: 'needs-input',
      });
    }
    expect(resolveOutreachReportReadiness(audit, reports, [superseded])).toEqual({
      state: 'ready',
    });
  });

  it('requires the newest French report to come from the selected French analysis (issue #509)', () => {
    expect(
      resolveOutreachReportReadiness(audit, [report('fr')], [], `${audit.auditId}-fr`),
    ).toEqual({ state: 'ready' });
    // A failed regeneration moved the selected pair past the newest report.
    expect(resolveOutreachReportReadiness(audit, [report('fr')], [], 'analysis-newer')).toEqual({
      state: 'not-ready',
      reason: 'stale',
    });
    expect(resolveOutreachReportReadiness(audit, [report('fr')], [], null)).toEqual({
      state: 'not-ready',
      reason: 'stale',
    });
  });

  it('is ready again once regeneration produced a current pair after a failure', () => {
    const failed = {
      auditId: audit.auditId,
      status: 'failed' as const,
      createdAt: audit.startedAt,
    };
    expect(resolveOutreachReportReadiness(audit, [report('fr'), report('en')], [failed])).toEqual({
      state: 'ready',
    });
  });
});

const { available, connection } = await probeMongoAvailability(
  scopedMongoTestUri('outreach_report_readiness'),
);

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

describe.skipIf(!available)('findAuditsWithUnreadyReports (issue #389)', () => {
  beforeEach(async () => {
    for (const name of ['audits', 'reports', 'jobs', 'analyses']) {
      await connection!.collection(name).deleteMany({});
    }
    await connection!
      .collection('analyses')
      .insertMany([
        analysis(audit.auditId, 'fr'),
        analysis('audit-ready', 'fr'),
        analysis('audit-ready', 'en'),
        analysis('audit-french-only', 'fr'),
      ]);
    await connection!
      .collection('audits')
      .insertMany([
        audit,
        { ...audit, auditId: 'audit-ready' },
        { ...audit, auditId: 'audit-french-only' },
        { auditId: 'audit-legacy', startedAt: audit.startedAt },
      ]);
    await connection!
      .collection('reports')
      .insertMany([
        report('fr', { auditId: 'audit-ready' }),
        report('en', { auditId: 'audit-ready' }),
        report('fr', { auditId: 'audit-french-only' }),
        report('fr', { findingsProvenance: staleProvenance }),
      ]);
  });

  it('flags audits whose reports are missing or stale, never legacy audits', async () => {
    const unready = await findAuditsWithUnreadyReports(connection!, [
      audit.auditId,
      'audit-ready',
      'audit-french-only',
      'audit-legacy',
    ]);
    expect([...unready]).toEqual([audit.auditId]);
    await expect(findAuditsWithUnreadyReports(connection!, [])).resolves.toEqual(new Set());
  });
});

describe.skipIf(!available)('loadOutreachReportReadiness', () => {
  const prospectId = 'prospect-cap';

  beforeEach(async () => {
    for (const name of ['audits', 'reports', 'jobs', 'analyses']) {
      await connection!.collection(name).deleteMany({});
    }
    await connection!.collection('audits').insertOne({ ...audit, prospectId });
    await connection!
      .collection('analyses')
      .insertMany([analysis(audit.auditId, 'fr'), analysis(audit.auditId, 'en')]);
  });

  it('reads the audit provenance, its reports and the prospect jobs', async () => {
    await connection!.collection('jobs').insertOne({
      jobId: 'job-cap',
      type: 'full-audit',
      status: 'failed',
      phase: 'failed',
      auditId: audit.auditId,
      options: { prospectId },
      createdAt: audit.startedAt,
    });
    await expect(
      loadOutreachReportReadiness(connection!, { auditId: audit.auditId, prospectId }),
    ).resolves.toEqual({ state: 'not-ready', reason: 'failed' });

    await connection!.collection('reports').insertMany([report('fr'), report('en')]);
    await expect(
      loadOutreachReportReadiness(connection!, { auditId: audit.auditId, prospectId }),
    ).resolves.toEqual({ state: 'ready' });
  });

  it('is not ready when the selected pair moved past the newest French report (issue #509)', async () => {
    await connection!.collection('reports').insertOne(report('fr'));
    await connection!
      .collection('analyses')
      .insertOne(analysis(audit.auditId, 'fr', 'analysis-after-failed-regeneration'));
    await connection!.collection('audits').updateOne(
      { auditId: audit.auditId },
      {
        $set: {
          'reportPreparation.writingSelection.selected': {
            frAnalysisId: 'analysis-after-failed-regeneration',
            findingsProvenance: provenance,
          },
        },
      },
    );

    await expect(
      loadOutreachReportReadiness(connection!, { auditId: audit.auditId, prospectId }),
    ).resolves.toEqual({ state: 'not-ready', reason: 'stale' });
    await expect(findAuditsWithUnreadyReports(connection!, [audit.auditId])).resolves.toEqual(
      new Set([audit.auditId]),
    );
  });

  it('fails closed for an unknown audit', async () => {
    await expect(
      loadOutreachReportReadiness(connection!, { auditId: 'audit-unknown', prospectId }),
    ).resolves.toEqual({ state: 'not-ready', reason: 'missing' });
  });
});
