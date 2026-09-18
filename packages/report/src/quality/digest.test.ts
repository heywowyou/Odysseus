import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { bytesDigest, canonicalJson, reportQualityDigest } from './digest.js';

describe('canonicalJson', () => {
  it('is stable under key order', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('sorts keys recursively and preserves array order', () => {
    const value = { z: [{ b: 1, a: [true, null] }], a: { y: 1, x: 'text' } };
    expect(canonicalJson(value)).toBe('{"a":{"x":"text","y":1},"z":[{"a":[true,null],"b":1}]}');
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('encodes scalars exactly like JSON', () => {
    expect(canonicalJson(null)).toBe('null');
    expect(canonicalJson(12)).toBe('12');
    expect(canonicalJson('échappe')).toBe('"échappe"');
    expect(canonicalJson(false)).toBe('false');
  });
});

describe('bytesDigest', () => {
  it('is a sha256 digest string for the exact bytes', () => {
    expect(bytesDigest(Buffer.alloc(0))).toBe(
      `sha256:${createHash('sha256').update(Buffer.alloc(0)).digest('hex')}`,
    );
    expect(bytesDigest(Buffer.from('odysseus', 'utf8'))).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('differs when a single byte changes', () => {
    const first = bytesDigest(Buffer.from([0x00]));
    const second = bytesDigest(Buffer.from([0x01]));
    expect(first).not.toBe(second);
  });
});

describe('reportQualityDigest', () => {
  const gatePayload = {
    pdfDigest: `sha256:${'a'.repeat(64)}`,
    extractedTextDigest: `sha256:${'b'.repeat(64)}`,
    pageCount: 1,
    pageWidthPt: 595,
    pageHeightPt: 842,
    toolVersions: { qpdf: 'qpdf version 11.0.0', pdfinfo: 'pdfinfo version 24.02.0' },
  };

  it('returns the same digest for the same input regardless of key order', () => {
    const reordered = {
      toolVersions: gatePayload.toolVersions,
      pageHeightPt: gatePayload.pageHeightPt,
      pageWidthPt: gatePayload.pageWidthPt,
      pageCount: gatePayload.pageCount,
      extractedTextDigest: gatePayload.extractedTextDigest,
      pdfDigest: gatePayload.pdfDigest,
    };
    expect(reportQualityDigest(gatePayload)).toBe(reportQualityDigest(reordered));
    expect(reportQualityDigest(gatePayload)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('returns a different digest when any gate input changes', () => {
    const base = reportQualityDigest(gatePayload);
    expect(base).not.toBe(reportQualityDigest({ ...gatePayload, pageCount: 2 }));
    expect(base).not.toBe(
      reportQualityDigest({
        ...gatePayload,
        toolVersions: { ...gatePayload.toolVersions, mutool: 'mutool version 1.24.0' },
      }),
    );
  });
});
