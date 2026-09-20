import { describe, expect, it } from 'vitest';
import type { WritingOverrideFile } from '@odysseus/llm';
import { parseFinalizedReportUpload } from './finalized-report-upload.js';

const lineage = {
  auditId: 'audit-1',
  language: 'fr',
  analysisId: 'analysis-1',
  analysisDigest: `sha256:${'a'.repeat(64)}`,
  findingsDigest: `sha256:${'b'.repeat(64)}`,
};

const overrides: WritingOverrideFile = {
  auditId: 'audit-1',
  language: 'fr',
  analysisDigest: lineage.analysisDigest,
  findingsDigest: lineage.findingsDigest,
  overrides: [
    {
      path: 'executiveSummary',
      from: 'Avant.',
      to: 'Après.',
      reason: 'Formulation revue avec le client.',
    },
  ],
};

const pdfBase64 = Buffer.from('%PDF-1.7\nfake\n%%EOF\n').toString('base64');

function body(overridesOf: Partial<Record<string, unknown>> = {}) {
  return {
    lineage,
    overrides,
    pdfBase64,
    rendererBuild: 'local-abc',
    reportTemplateVersion: 3,
    pageCount: 42,
    ...overridesOf,
  };
}

describe('parseFinalizedReportUpload', () => {
  it('accepts what the upload script posts', () => {
    const result = parseFinalizedReportUpload(body());

    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.lineage).toEqual(lineage);
    expect(result.overrides).toEqual(overrides);
    expect(result.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.pageCount).toBe(42);
  });

  /** The digest is what the row records as proof of which corrections were
   *  applied, so the server computes it rather than believing the uploader. */
  it('digests the override file itself and ignores any digest the client sends', () => {
    const declared = parseFinalizedReportUpload(
      body({ overridesDigest: `sha256:${'0'.repeat(64)}` }),
    );
    const plain = parseFinalizedReportUpload(body());

    expect(typeof declared).not.toBe('string');
    if (typeof declared === 'string' || typeof plain === 'string') return;
    expect(declared.overridesDigest).toBe(plain.overridesDigest);
    expect(declared.overridesDigest).not.toBe(`sha256:${'0'.repeat(64)}`);
  });

  /** A re-render on newer code that rewrote nothing is a real finalization;
   *  it just has no override file. */
  it('accepts a finalization with no corrections', () => {
    const result = parseFinalizedReportUpload(body({ overrides: null }));

    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.overrides).toBeUndefined();
  });

  it('refuses an override file bound to a different analysis than the declared lineage', () => {
    const result = parseFinalizedReportUpload(
      body({ overrides: { ...overrides, analysisDigest: `sha256:${'c'.repeat(64)}` } }),
    );

    expect(result).toMatch(/do not match the declared lineage/u);
  });

  /** Buffer.from drops anything that is not base64, so a truncated payload
   *  decodes to something short rather than throwing. A row pointing at bytes
   *  nobody can open is worse than a 400. */
  it('refuses a payload that does not decode to a PDF', () => {
    expect(parseFinalizedReportUpload(body({ pdfBase64: 'bm90IGEgcGRm' }))).toMatch(
      /does not decode to a PDF/u,
    );
    expect(parseFinalizedReportUpload(body({ pdfBase64: '' }))).toMatch(/pdfBase64 is required/u);
  });

  it('names the missing field rather than failing generically', () => {
    expect(parseFinalizedReportUpload(body({ rendererBuild: undefined }))).toMatch(
      /rendererBuild is required/u,
    );
    expect(parseFinalizedReportUpload(body({ reportTemplateVersion: '3' }))).toMatch(
      /reportTemplateVersion must be an integer/u,
    );
    expect(parseFinalizedReportUpload(body({ pageCount: 0 }))).toMatch(/pageCount must be/u);
    expect(parseFinalizedReportUpload({ ...body(), lineage: undefined })).toMatch(
      /lineage is required/u,
    );
    expect(parseFinalizedReportUpload('not an object')).toMatch(/must be a JSON object/u);
  });
});
