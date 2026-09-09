import { describe, expect, it } from 'vitest';
import { pdfDigestOf } from './pdf-digest.js';

describe('pdfDigestOf', () => {
  it('prefixes sha256 over the exact bytes', () => {
    expect(pdfDigestOf(Buffer.from(''))).toBe(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(pdfDigestOf(Buffer.from('odysseus'))).toBe(
      'sha256:a4f69f05a14b45279351d25de2576a1b571f3a1af29d2b8f214335b4fbc4ee79',
    );
  });
});
