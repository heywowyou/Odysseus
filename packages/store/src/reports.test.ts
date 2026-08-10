import { afterAll, describe, expect, it } from 'vitest';
import { persistReport } from './persist-report.js';
import { getLatestReport, listReportCombos, listReportLanguages } from './reports.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('reports read helpers', () => {
  it('getLatestReport returns the most recently generated report for a language', async () => {
    await persistReport(connection!, {
      auditId: 'reports-read-1',
      language: 'fr',
      tier: 'full',
      reportTemplateVersion: 1,
      analysisGeneratedAt: new Date('2026-08-02T00:00:00.000Z'),
      fileRef: 'reports/old-fr.pdf',
      generatedAt: new Date('2026-08-02T00:00:00.000Z'),
    });
    await persistReport(connection!, {
      auditId: 'reports-read-1',
      language: 'fr',
      tier: 'full',
      reportTemplateVersion: 2,
      analysisGeneratedAt: new Date('2026-08-03T00:00:00.000Z'),
      fileRef: 'reports/new-fr.pdf',
      generatedAt: new Date('2026-08-03T00:00:00.000Z'),
    });

    const latest = await getLatestReport(connection!, 'reports-read-1', 'fr');
    expect(latest?.fileRef).toBe('reports/new-fr.pdf');
  });

  it('returns null when no report exists for that language', async () => {
    const missing = await getLatestReport(connection!, 'reports-read-missing', 'en');
    expect(missing).toBeNull();
  });

  it('defaults to the full tier and does not return a screening report for the same audit/language', async () => {
    await persistReport(connection!, {
      auditId: 'reports-read-tier',
      language: 'fr',
      tier: 'screening',
      reportTemplateVersion: 1,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/x-fr-screening.pdf',
      generatedAt: new Date(),
    });

    const full = await getLatestReport(connection!, 'reports-read-tier', 'fr');
    expect(full).toBeNull();

    const screening = await getLatestReport(connection!, 'reports-read-tier', 'fr', 'screening');
    expect(screening?.fileRef).toBe('reports/x-fr-screening.pdf');
  });

  it('listReportLanguages returns the distinct languages generated for an audit', async () => {
    await persistReport(connection!, {
      auditId: 'reports-read-2',
      language: 'fr',
      tier: 'full',
      reportTemplateVersion: 1,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/x-fr.pdf',
      generatedAt: new Date(),
    });
    await persistReport(connection!, {
      auditId: 'reports-read-2',
      language: 'en',
      tier: 'full',
      reportTemplateVersion: 1,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/x-en.pdf',
      generatedAt: new Date(),
    });

    const languages = await listReportLanguages(connection!, 'reports-read-2');
    expect([...languages].sort()).toEqual(['en', 'fr']);
  });

  it('listReportCombos returns each distinct (language, tier) pair once, even with a re-generated duplicate', async () => {
    await persistReport(connection!, {
      auditId: 'reports-read-combos',
      language: 'fr',
      tier: 'screening',
      reportTemplateVersion: 1,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/a-screening-fr.pdf',
      generatedAt: new Date(),
    });
    await persistReport(connection!, {
      auditId: 'reports-read-combos',
      language: 'fr',
      tier: 'full',
      reportTemplateVersion: 1,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/a-full-fr.pdf',
      generatedAt: new Date(),
    });
    await persistReport(connection!, {
      auditId: 'reports-read-combos',
      language: 'fr',
      tier: 'full',
      reportTemplateVersion: 2,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/b-full-fr.pdf',
      generatedAt: new Date(),
    });
    await persistReport(connection!, {
      auditId: 'reports-read-combos',
      language: 'en',
      tier: 'full',
      reportTemplateVersion: 1,
      analysisGeneratedAt: new Date(),
      fileRef: 'reports/a-full-en.pdf',
      generatedAt: new Date(),
    });

    const combos = await listReportCombos(connection!, 'reports-read-combos');
    const keys = combos.map((c) => `${c.language}:${c.tier}`).sort();
    expect(keys).toEqual(['en:full', 'fr:full', 'fr:screening']);
  });
});
