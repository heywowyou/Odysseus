import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  classifyReportRows,
  type ReportIntegrityFs,
  type ReportIntegrityInputRow,
} from './integrity.js';

const AUDIT_DIR = '/artifacts/www.example.com/2026-09-03T20-44-46Z';

function digestOf(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

/** In-memory fs: files are the keys, contents the values. */
function fakeFs(files: Record<string, string>): ReportIntegrityFs {
  return {
    exists: (filePath) => Promise.resolve(filePath in files),
    read: (filePath) => {
      const content = files[filePath];
      if (content === undefined) throw new Error(`unexpected read: ${filePath}`);
      return Promise.resolve(Buffer.from(content));
    },
  };
}

function row(overrides: Partial<ReportIntegrityInputRow> = {}): ReportIntegrityInputRow {
  return {
    reportId: 'report-1',
    auditId: 'audit-1',
    language: 'fr',
    generatedAt: new Date('2026-09-03T20:56:41Z'),
    rendererBuild: '2b7eec6',
    renderedOnHost: 'workstation',
    fileRef: 'reports/2026-09-03T20-56-41Z-t2-2b7eec6-report-1-fr.pdf',
    pdfDigest: digestOf('pdf-bytes'),
    ...overrides,
  };
}

describe('classifyReportRows (issue #62)', () => {
  const dirs = new Map([['audit-1', AUDIT_DIR]]);

  it('classifies ok when the file exists and its digest matches the row', async () => {
    const entries = await classifyReportRows(
      [row()],
      dirs,
      'workstation',
      fakeFs({ [`${AUDIT_DIR}/reports/2026-09-03T20-56-41Z-t2-2b7eec6-report-1-fr.pdf`]: 'pdf-bytes' }),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('ok');
  });

  it('classifies file-missing, naming the rendering host, when the file is on no such path', async () => {
    const entries = await classifyReportRows(
      [row({ renderedOnHost: 'vps-odysseus' })],
      dirs,
      'workstation',
      fakeFs({}),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe('file-missing');
    expect(entries[0]?.detail).toContain('rendered on host "vps-odysseus"');
    expect(entries[0]?.detail).toContain('may exist on that host');
  });

  it('does not add the rendered-elsewhere note when the row names this host', async () => {
    const entries = await classifyReportRows([row()], dirs, 'workstation', fakeFs({}));
    expect(entries[0]?.status).toBe('file-missing');
    expect(entries[0]?.detail).not.toContain('rendered on host');
  });

  it('classifies digest-mismatch and records the actual digest when the file differs', async () => {
    const entries = await classifyReportRows(
      [row({ renderedOnHost: 'workstation' })],
      dirs,
      'workstation',
      fakeFs({ [`${AUDIT_DIR}/reports/2026-09-03T20-56-41Z-t2-2b7eec6-report-1-fr.pdf`]: 'different-bytes' }),
    );
    expect(entries[0]?.status).toBe('digest-mismatch');
    expect(entries[0]?.actualDigest).toBe(digestOf('different-bytes'));
  });

  it('classifies digest-unrecorded for a legacy row with no pdfDigest', async () => {
    // exactOptionalPropertyTypes: absence is encoded by omitting the key.
    const { pdfDigest: _omitted, ...legacy } = row();
    const entries = await classifyReportRows(
      [legacy],
      dirs,
      'workstation',
      fakeFs({ [`${AUDIT_DIR}/reports/2026-09-03T20-56-41Z-t2-2b7eec6-report-1-fr.pdf`]: 'pdf-bytes' }),
    );
    expect(entries[0]?.status).toBe('digest-unrecorded');
  });

  it('classifies audit-dir-unknown when no audits row can be resolved', async () => {
    const entries = await classifyReportRows(
      [row()],
      new Map(),
      'workstation',
      fakeFs({}),
    );
    expect(entries[0]?.status).toBe('audit-dir-unknown');
    expect(entries[0]?.detail).toContain('audit directory');
  });

  it('classifies every row independently across audits, statuses and languages', async () => {
    const goodPath = `${AUDIT_DIR}/reports/good-en.pdf`;
    const entries = await classifyReportRows(
      [
        row({ reportId: 'r-good', language: 'en', fileRef: 'reports/good-en.pdf' }),
        row({ reportId: 'r-missing', language: 'fr', fileRef: 'reports/missing-fr.pdf' }),
        row({
          reportId: 'r-other-audit',
          auditId: 'audit-2',
          fileRef: 'reports/x.pdf',
        }),
      ],
      new Map([
        ['audit-1', AUDIT_DIR],
        ['audit-2', '/artifacts/other.example.com/2026-09-01T00-00-00Z'],
      ]),
      'workstation',
      fakeFs({ [goodPath]: 'pdf-bytes' }),
    );
    expect(entries.map((entry) => entry.status)).toEqual([
      'ok',
      'file-missing',
      'file-missing',
    ]);
  });
});
