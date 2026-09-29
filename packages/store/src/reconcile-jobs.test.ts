import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type { FindingsProvenance } from '@odysseus/core';
import {
  completeJob,
  createJob,
  failJob,
  getJob,
  markJobNeedsInput,
  updateJobProgress,
} from './jobs.js';
import { reconcileFailedAuditJobs } from './reconcile-jobs.js';
import { createAuditModel } from './schemas/audit.schema.js';
import { createReportModel } from './schemas/report.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

function provenance(digest: string): FindingsProvenance {
  return { findingsSchemaVersion: 1, normalizationFingerprint: 'fp-test', findingsDigest: digest };
}

/** A stored audit row carrying the given provenance, built through the
 *  same persistAudit-shaped document the pipeline writes. Only the fields
 *  reconciliation reads (auditId, findingsProvenance) are distinct per
 *  test; the rest satisfy the schema's required-field validation. */
async function storeAudit(
  auditId: string,
  auditProvenance: FindingsProvenance,
  selectedEnglishAnalysisId?: string,
): Promise<void> {
  const AuditModel = createAuditModel(connection!);
  await AuditModel.create({
    auditId,
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: new Date('2026-09-01T00:00:00.000Z'),
    finishedAt: new Date('2026-09-01T00:05:00.000Z'),
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
      pageTimeoutMs: 30000,
      lighthouseTimeoutMs: 60000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 3,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
    findingsProvenance: auditProvenance,
    ...(selectedEnglishAnalysisId !== undefined
      ? {
          reportPreparation: {
            writingSelection: {
              selected: {
                frAnalysisId: 'selected-fr-analysis',
                enAnalysisId: selectedEnglishAnalysisId,
                findingsProvenance: auditProvenance,
              },
            },
            updatedAt: '2026-09-01T00:05:00.000Z',
          },
        }
      : {}),
  });
}

async function storeReport(
  auditId: string,
  language: 'fr' | 'en',
  reportProvenance: FindingsProvenance,
  analysisId = `${auditId}-${language}`,
): Promise<void> {
  const ReportModel = createReportModel(connection!);
  await ReportModel.create({
    reportId: randomUUID(),
    auditId,
    analysisId,
    findingsProvenance: reportProvenance,
    rendererVersion: 1,
    rendererBuild: 'test',
    pdfDigest: `sha256:${randomUUID()}`,
    language,
    reportTemplateVersion: 1,
    analysisGeneratedAt: new Date('2026-09-01T00:04:00.000Z'),
    fileRef: `reports/test-${language}.pdf`,
    generatedAt: new Date('2026-09-01T00:06:00.000Z'),
  });
}

/** The analysis a report is rendered from; with no explicit writing
 *  selection, the newest analyses are the selected pair (issue #567). */
async function storeAnalysis(
  auditId: string,
  language: 'fr' | 'en',
  analysisProvenance: FindingsProvenance,
): Promise<void> {
  await connection!.collection('analyses').insertOne({
    analysisId: `${auditId}-${language}`,
    auditId,
    language,
    generatedAt: new Date('2026-09-01T00:04:00.000Z'),
    findingsProvenance: analysisProvenance,
  });
}

/** The production shape of the defect: the audit stage resolved (its
 *  auditId was written by updateJobProgress, issue #35's early link), a
 *  later stage threw, and the queue marked the job failed. */
async function storeFailedFullAuditJob(auditId: string): Promise<string> {
  const job = await createJob(connection!, {
    type: 'full-audit',
    siteUrl: 'https://example.com/',
    options: {},
  });
  await updateJobProgress(connection!, job.jobId, { phase: 'report-fr', auditId });
  await failJob(connection!, job.jobId, 'report stage failed');
  return job.jobId;
}

/** Issue #73's shape of the same defect: the report stage stopped
 *  deliberately on the D8 identity-confirmation gate rather than
 *  crashing, so the queue wrote 'needs-input' instead of 'failed'. */
async function storeNeedsInputFullAuditJob(auditId: string): Promise<string> {
  const job = await createJob(connection!, {
    type: 'full-audit',
    siteUrl: 'https://example.com/',
    options: {},
  });
  await updateJobProgress(connection!, job.jobId, { phase: 'report-fr', auditId });
  await markJobNeedsInput(
    connection!,
    job.jobId,
    [{ field: 'nomCommercial', value: 'Site Officiel' }],
    'identity fields not confirmed',
  );
  return job.jobId;
}

describe.skipIf(!mongoAvailable)('reconcileFailedAuditJobs', () => {
  it('advances a failed full-audit job whose audit gained a current bilingual report pair', async () => {
    const auditId = randomUUID();
    const pair = provenance(`digest-${auditId}`);
    await storeAudit(auditId, pair);
    await storeAnalysis(auditId, 'fr', pair);
    await storeAnalysis(auditId, 'en', pair);
    await storeReport(auditId, 'fr', pair);
    await storeReport(auditId, 'en', pair);
    const jobId = await storeFailedFullAuditJob(auditId);

    const advanced = await reconcileFailedAuditJobs(connection!);
    expect(advanced).toBeGreaterThanOrEqual(1);

    const job = await getJob(connection!, jobId);
    expect(job?.status).toBe('complete');
    expect(job?.phase).toBe('complete');
    // The failure's own record survives the relabel: the dashboard may no
    // longer call the audit failed, but the row still says what broke.
    expect(job?.error).toBe('report stage failed');
    expect(job?.auditId).toBe(auditId);
    expect(job?.finishedAt).toBeInstanceOf(Date);
  });

  it('advances a needs-input full-audit job whose audit gained a current bilingual report pair', async () => {
    const auditId = randomUUID();
    const pair = provenance(`digest-${auditId}`);
    await storeAudit(auditId, pair);
    await storeAnalysis(auditId, 'fr', pair);
    await storeAnalysis(auditId, 'en', pair);
    await storeReport(auditId, 'fr', pair);
    await storeReport(auditId, 'en', pair);
    const jobId = await storeNeedsInputFullAuditJob(auditId);

    const advanced = await reconcileFailedAuditJobs(connection!);
    expect(advanced).toBeGreaterThanOrEqual(1);

    const job = await getJob(connection!, jobId);
    expect(job?.status).toBe('complete');
    expect(job?.phase).toBe('complete');
    // The stop's own record survives the relabel, same as a recovered
    // 'failed' job's error text does.
    expect(job?.error).toBe('identity fields not confirmed');
    expect(job?.needsInputFields).toEqual([{ field: 'nomCommercial', value: 'Site Officiel' }]);
    expect(job?.auditId).toBe(auditId);
  });

  it('advances from a current French report when no English analysis was selected', async () => {
    const auditId = randomUUID();
    const pair = provenance(`digest-${auditId}`);
    await storeAudit(auditId, pair);
    await storeAnalysis(auditId, 'fr', pair);
    await storeReport(auditId, 'fr', pair);
    const jobId = await storeFailedFullAuditJob(auditId);

    await reconcileFailedAuditJobs(connection!);

    const job = await getJob(connection!, jobId);
    expect(job?.status).toBe('complete');
  });

  it('keeps the job failed when a selected English report is missing', async () => {
    const auditId = randomUUID();
    const pair = provenance(`digest-${auditId}`);
    await storeAudit(auditId, pair, 'selected-en-analysis');
    await storeReport(auditId, 'fr', pair);
    const jobId = await storeFailedFullAuditJob(auditId);

    await reconcileFailedAuditJobs(connection!);

    expect((await getJob(connection!, jobId))?.status).toBe('failed');
  });

  it('keeps the job failed when the French report was not rendered from the selected analysis', async () => {
    const auditId = randomUUID();
    const pair = provenance(`digest-${auditId}`);
    await storeAudit(auditId, pair);
    await storeAnalysis(auditId, 'fr', pair);
    await storeReport(auditId, 'fr', pair, 'an-older-analysis');
    const jobId = await storeFailedFullAuditJob(auditId);

    await reconcileFailedAuditJobs(connection!);

    expect((await getJob(connection!, jobId))?.status).toBe('failed');
  });

  it('leaves the job failed when the reports are stale against the audit provenance', async () => {
    const auditId = randomUUID();
    await storeAudit(auditId, provenance(`digest-${auditId}`));
    // Reports derived from older findings: the audit is not "done" in its
    // current form, exactly as the detail page's own freshness rule sees it.
    await storeReport(auditId, 'fr', provenance('stale-fr'));
    await storeReport(auditId, 'en', provenance('stale-en'));
    const jobId = await storeFailedFullAuditJob(auditId);

    await reconcileFailedAuditJobs(connection!);

    const job = await getJob(connection!, jobId);
    expect(job?.status).toBe('failed');
  });

  it('leaves the job failed when no audit exists for its auditId', async () => {
    const auditId = randomUUID();
    const jobId = await storeFailedFullAuditJob(auditId);

    await reconcileFailedAuditJobs(connection!);

    const job = await getJob(connection!, jobId);
    expect(job?.status).toBe('failed');
  });

  it('never touches an already complete job', async () => {
    const auditId = randomUUID();
    const pair = provenance(`digest-${auditId}`);
    await storeAudit(auditId, pair);
    await storeReport(auditId, 'fr', pair);
    await storeReport(auditId, 'en', pair);
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://example.com/',
      options: {},
    });
    await updateJobProgress(connection!, job.jobId, { auditId });
    await completeJob(connection!, job.jobId, { auditId });

    const before = await getJob(connection!, job.jobId);
    await reconcileFailedAuditJobs(connection!);
    const after = await getJob(connection!, job.jobId);

    expect(after?.finishedAt?.getTime()).toBe(before?.finishedAt?.getTime());
  });
});
