import { describe, expect, it } from 'vitest';
import { escapeHtml, formatDate } from './html-utils.js';

describe('escapeHtml', () => {
  it('escapes tags and quotes so injected markup cannot execute', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersands and single quotes', () => {
    expect(escapeHtml(`Tom & Jerry's`)).toBe('Tom &amp; Jerry&#39;s');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('color-contrast')).toBe('color-contrast');
  });
});

describe('formatDate', () => {
  it('formats in French for fr', () => {
    const date = new Date('2026-08-02T12:00:00Z');
    expect(formatDate(date, 'fr')).toContain('2026');
  });

  it('formats in English for en', () => {
    const date = new Date('2026-08-02T12:00:00Z');
    expect(formatDate(date, 'en')).toContain('2026');
  });
});
