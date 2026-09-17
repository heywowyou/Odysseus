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
  return {
    auditId: audit.auditId,
    language,
    generatedAt: new Date('2026-09-16T11:00:00.000Z'),
    findingsProvenance: provenance,
    ...overrides,
  };
}

describe('resolveOutreachReportReadiness (issue #388)', () => {
  it('is ready with a current FR and EN report for the audit', () => {
    expect(resolveOutreachReportReadiness(audit, [report('fr'), report('en')], [])).toEqual({
      state: 'ready',
    });
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

  it('is missing when one language was never produced, including historical audits', () => {
    expect(resolveOutreachReportReadiness(audit, [report('fr')], [])).toEqual({
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
    for (const name of ['audits', 'reports', 'jobs']) {
      await connection!.collection(name).deleteMany({});
    }
    await connection!
      .collection('audits')
      .insertMany([
        audit,
        { ...audit, auditId: 'audit-ready' },
        { auditId: 'audit-legacy', startedAt: audit.startedAt },
      ]);
    await connection!
      .collection('reports')
      .insertMany([
        report('fr', { auditId: 'audit-ready' }),
        report('en', { auditId: 'audit-ready' }),
        report('fr', { findingsProvenance: staleProvenance }),
      ]);
  });

  it('flags audits whose reports are missing or stale, never legacy audits', async () => {
    const unready = await findAuditsWithUnreadyReports(connection!, [
      audit.auditId,
      'audit-ready',
      'audit-legacy',
    ]);
    expect([...unready]).toEqual([audit.auditId]);
    await expect(findAuditsWithUnreadyReports(connection!, [])).resolves.toEqual(new Set());
  });
});

describe.skipIf(!available)('loadOutreachReportReadiness', () => {
  const prospectId = 'prospect-cap';

  beforeEach(async () => {
    for (const name of ['audits', 'reports', 'jobs']) {
      await connection!.collection(name).deleteMany({});
    }
    await connection!.collection('audits').insertOne({ ...audit, prospectId });
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

  it('fails closed for an unknown audit', async () => {
    await expect(
      loadOutreachReportReadiness(connection!, { auditId: 'audit-unknown', prospectId }),
    ).resolves.toEqual({ state: 'not-ready', reason: 'missing' });
  });
});
