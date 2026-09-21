import { describe, expect, it } from 'vitest';
import { resolveReportVariant } from './report-variants.js';

const dark = {
  fileRef: 'reports/audit-fr.pdf',
  pdfDigest: 'sha256:dark',
  pageCount: 12,
};

describe('resolveReportVariant', () => {
  it('resolves the canonical dark artifact without consulting light', () => {
    expect(
      resolveReportVariant(
        {
          ...dark,
          variants: { light: { fileRef: 'reports/audit-fr-clair.pdf', pdfDigest: 'sha256:light' } },
        },
        'dark',
      ),
    ).toEqual({
      kind: 'available',
      theme: 'dark',
      fileRef: dark.fileRef,
      pdfDigest: dark.pdfDigest,
      pageCount: dark.pageCount,
    });
  });

  it('resolves an exact light sibling when present', () => {
    expect(
      resolveReportVariant(
        {
          ...dark,
          variants: {
            light: {
              fileRef: 'reports/audit-fr-clair.pdf',
              pdfDigest: 'sha256:light',
              pageCount: 13,
            },
          },
        },
        'light',
      ),
    ).toEqual({
      kind: 'available',
      theme: 'light',
      fileRef: 'reports/audit-fr-clair.pdf',
      pdfDigest: 'sha256:light',
      pageCount: 13,
    });
  });

  it('refuses light without falling back to dark bytes', () => {
    expect(resolveReportVariant(dark, 'light')).toEqual({
      kind: 'unavailable',
      theme: 'light',
      reason: 'light-variant-unavailable',
    });
  });
});
