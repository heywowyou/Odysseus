import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { approvalCoversReport, approvalMatchesReportPair } from '@odysseus/core';
import { getLatestReportApproval, persistReportApproval } from './report-approvals.js';
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

/** Pure over a plain approval object, so it runs with or without Docker
 *  Mongo: the single-language delivery rule is the part that regressed. */
describe('approvalCoversReport', () => {
  const approval = {
    approvalId: 'approval-cover',
    auditId,
    fr: { reportId: 'fr-1', pdfDigest: 'sha256:fr' },
    en: { reportId: 'en-1', pdfDigest: 'sha256:en' },
    approvedAt: new Date('2026-08-29T12:00:00.000Z'),
  };

  it('covers the French report of a bilingual approval, which the pair check refused', () => {
    expect(approvalCoversReport(approval, 'fr', approval.fr)).toBe(true);
    // The regression: delivering French asked the pair question with no
    // English report to compare, and a bilingual approval always said no.
    expect(approvalMatchesReportPair(approval, { fr: approval.fr })).toBe(false);
  });

  it('keeps the French report deliverable after the English attachment is regenerated', () => {
    expect(approvalCoversReport(approval, 'fr', approval.fr)).toBe(true);
    expect(
      approvalCoversReport(approval, 'en', { reportId: 'en-2', pdfDigest: 'sha256:en2' }),
    ).toBe(false);
  });

  it('refuses a report the approval does not name, and any language of a missing approval', () => {
    expect(approvalCoversReport(approval, 'fr', { reportId: 'fr-2', pdfDigest: 'sha256:fr' })).toBe(
      false,
    );
    expect(
      approvalCoversReport(approval, 'fr', { reportId: 'fr-1', pdfDigest: 'sha256:other' }),
    ).toBe(false);
    expect(approvalCoversReport(null, 'fr', approval.fr)).toBe(false);
  });

  it('refuses English when the approval carries no English attachment', () => {
    const { en: _attached, ...frenchOnly } = approval;
    expect(
      approvalCoversReport(frenchOnly, 'en', { reportId: 'en-1', pdfDigest: 'sha256:en' }),
    ).toBe(false);
    expect(approvalCoversReport(frenchOnly, 'fr', approval.fr)).toBe(true);
  });

  it('requires an exact approved light digest for light delivery', () => {
    const report = {
      reportId: 'fr-1',
      pdfDigest: 'sha256:fr',
      variants: { light: { pdfDigest: 'sha256:fr-light' } },
    };
    expect(approvalCoversReport(approval, 'fr', report, 'light')).toBe(false);
    const approved = {
      ...approval,
      fr: { ...approval.fr, variantDigests: { light: 'sha256:fr-light' } },
    };
    expect(approvalCoversReport(approved, 'fr', report, 'light')).toBe(true);
    expect(
      approvalCoversReport(
        approved,
        'fr',
        { ...report, variants: { light: { pdfDigest: 'sha256:other' } } },
        'light',
      ),
    ).toBe(false);
  });

  it('checks a French-only light approval in pair matching', () => {
    const { en: _attached, ...frenchOnly } = approval;
    const approved = {
      ...frenchOnly,
      fr: { ...frenchOnly.fr, variantDigests: { light: 'sha256:light-1' } },
    };
    const report = {
      reportId: 'fr-1',
      pdfDigest: 'sha256:fr',
      variants: { light: { pdfDigest: 'sha256:light-2' } },
    };

    expect(approvalMatchesReportPair(approved, { fr: report })).toBe(false);
  });

  it('keeps a legacy dark-only approval valid for the dark pair after light is added', () => {
    expect(
      approvalMatchesReportPair(approval, {
        fr: { ...approval.fr, variants: { light: { pdfDigest: 'sha256:fr-light' } } },
        en: { ...approval.en!, variants: { light: { pdfDigest: 'sha256:en-light' } } },
      }),
    ).toBe(true);
  });
});
