import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  approvalMatchesReportPair,
  getLatestReportApproval,
  persistReportApproval,
} from './report-approvals.js';
import { createReportApprovalModel } from './schemas/report-approval.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available, connection } = await probeMongoAvailability();
const auditId = 'report-approval-test';

beforeAll(async () => {
  if (connection) await createReportApprovalModel(connection).deleteMany({ auditId });
});

afterAll(async () => {
  if (!connection) return;
  await createReportApprovalModel(connection).deleteMany({ auditId });
  await connection.close();
});

describe.skipIf(!available)('report approvals', () => {
  it('inserts immutable approvals and matches only the exact current pair', async () => {
    const fields = {
      approvalId: 'approval-1',
      auditId,
      fr: { reportId: 'fr-1', pdfDigest: 'sha256:fr' },
      en: { reportId: 'en-1', pdfDigest: 'sha256:en' },
      approvedAt: new Date('2026-08-29T12:00:00.000Z'),
    };
    await persistReportApproval(connection!, fields);
    const approval = await getLatestReportApproval(connection!, auditId);
    expect(approvalMatchesReportPair(approval, fields)).toBe(true);
    expect(
      approvalMatchesReportPair(approval, {
        fr: { ...fields.fr, reportId: 'fr-2' },
        en: fields.en,
      }),
    ).toBe(false);
  });
});
