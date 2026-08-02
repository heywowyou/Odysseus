import { describe, expect, it } from 'vitest';
import { isNonHtmlContentType } from './crawl.js';

describe('isNonHtmlContentType', () => {
  it('treats a missing Content-Type as HTML', () => {
    expect(isNonHtmlContentType(undefined)).toBe(false);
  });

  it('treats text/html, including with a charset, as HTML', () => {
    expect(isNonHtmlContentType('text/html')).toBe(false);
    expect(isNonHtmlContentType('text/html; charset=utf-8')).toBe(false);
  });

  it('flags an image Content-Type as non-HTML', () => {
    expect(isNonHtmlContentType('image/jpeg')).toBe(true);
  });

  it('flags a PDF Content-Type as non-HTML', () => {
    expect(isNonHtmlContentType('application/pdf')).toBe(true);
  });
});
