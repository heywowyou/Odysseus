import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, NORMALIZATION_FINGERPRINT } from '@odysseus/core';
import type { ReportDocumentFields } from './schemas/report.schema.js';
import { createReportModel } from './schemas/report.schema.js';
import { persistReport } from './persist-report.js';
import { getLatestReport, listReportLanguages } from './reports.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();
let reportSequence = 0;

function reportFields(
  fields: Omit<
    ReportDocumentFields,
    | 'reportId'
    | 'analysisId'
    | 'findingsProvenance'
    | 'rendererVersion'
    | 'rendererBuild'
    | 'pdfDigest'
  >,
): ReportDocumentFields {
  reportSequence += 1;
  return {
    ...fields,
    reportId: `report-${reportSequence}`,
    analysisId: `analysis-${reportSequence}`,
    findingsProvenance: {
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      normalizationFingerprint: NORMALIZATION_FINGERPRINT,
      findingsDigest: `sha256:${'0'.repeat(64)}`,
    },
    rendererVersion: fields.reportTemplateVersion,
    rendererBuild: 'test-build',
    pdfDigest: `sha256:${'1'.repeat(64)}`,
  };
}

const TEST_AUDIT_IDS = ['reports-read-1', 'reports-read-2', 'reports-read-missing'];

/** Worker databases are reused between runs and never dropped, and reportId is
 *  unique, so a file that only inserts can pass exactly once per database. Clear
 *  before asserting as well as after, so a run aborted mid-suite does not leave
 *  the next one failing on a duplicate key. */
async function deleteTestReports(): Promise<void> {
  if (!connection) return;
  await createReportModel(connection).deleteMany({ auditId: { $in: TEST_AUDIT_IDS } });
}

beforeAll(deleteTestReports);

afterAll(async () => {
  await deleteTestReports();
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('reports read helpers', () => {
  it('getLatestReport returns the most recently generated report for a language', async () => {
    await persistReport(
      connection!,
      reportFields({
        auditId: 'reports-read-1',
        language: 'fr',
        reportTemplateVersion: 1,
        analysisGeneratedAt: new Date('2026-08-02T00:00:00.000Z'),
        fileRef: 'reports/old-fr.pdf',
        generatedAt: new Date('2026-08-02T00:00:00.000Z'),
      }),
    );
    await persistReport(
      connection!,
      reportFields({
        auditId: 'reports-read-1',
        language: 'fr',
        reportTemplateVersion: 2,
        analysisGeneratedAt: new Date('2026-08-03T00:00:00.000Z'),
        fileRef: 'reports/new-fr.pdf',
        generatedAt: new Date('2026-08-03T00:00:00.000Z'),
      }),
    );

    const latest = await getLatestReport(connection!, 'reports-read-1', 'fr');
    expect(latest?.fileRef).toBe('reports/new-fr.pdf');
  });

  it('returns null when no report exists for that language', async () => {
    const missing = await getLatestReport(connection!, 'reports-read-missing', 'en');
    expect(missing).toBeNull();
  });

  it('listReportLanguages returns the distinct languages generated for an audit', async () => {
    await persistReport(
      connection!,
      reportFields({
        auditId: 'reports-read-2',
        language: 'fr',
        reportTemplateVersion: 1,
        analysisGeneratedAt: new Date(),
        fileRef: 'reports/x-fr.pdf',
        generatedAt: new Date(),
      }),
    );
    await persistReport(
      connection!,
      reportFields({
        auditId: 'reports-read-2',
        language: 'en',
        reportTemplateVersion: 1,
        analysisGeneratedAt: new Date(),
        fileRef: 'reports/x-en.pdf',
        generatedAt: new Date(),
      }),
    );

    const languages = await listReportLanguages(connection!, 'reports-read-2');
    expect([...languages].sort()).toEqual(['en', 'fr']);
  });
});
