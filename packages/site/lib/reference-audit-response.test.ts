import { describe, expect, it } from 'vitest';
import { resolveReferenceAuditResponse } from './reference-audit-response';
import type { ReferenceAuditReader } from './reference-audit-object';

const manifest = {
  schemaVersion: 'reference-audit-v1' as const,
  objectKey: `reference-audit/${'a'.repeat(64)}.pdf` as `reference-audit/${string}.pdf`,
  pdfSha256: 'a'.repeat(64),
  publishedAt: '2026-09-20T10:00:00.000Z',
  rendererBuild: 'renderer-071',
  reportTemplateVersion: 3,
  dataVersion: 'normalization-v1',
  anonymizerVersion: 'reference-anonymizer-v1',
  referenceReleaseVersion: 'reference-release-v1',
  pageCount: 18,
  releaseStatus: 'approved' as const,
};

describe('public reference audit response', () => {
  it('serves the approved PDF with bounded cache and noindex headers', async () => {
    const reader: ReferenceAuditReader = {
      readCurrent: async () => ({ manifest, pdf: new Uint8Array([37, 80, 68, 70]) }),
    };
    const response = await resolveReferenceAuditResponse({ reader });
    expect(response.status).toBe(200);
    expect(response.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-disposition': 'inline; filename="exemple-audit-odysseus.pdf"',
      'x-robots-tag': 'noindex, noarchive',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    });
    expect(response.body).toBeInstanceOf(ArrayBuffer);
  });

  it('fails closed without leaking storage details when no approved pointer exists', async () => {
    const response = await resolveReferenceAuditResponse({
      reader: { readCurrent: async () => null },
    });
    expect(response.status).toBe(503);
    expect(response.body).toContain('temporarily unavailable');
    expect(response.body).not.toContain('reference-release');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('keeps provider failures fail-closed and source-free', async () => {
    const response = await resolveReferenceAuditResponse({
      reader: {
        readCurrent: async () => {
          throw new Error('source-audit-123 provider detail');
        },
      },
    });
    expect(response.status).toBe(503);
    expect(response.body).not.toContain('source-audit-123');
  });
});
