import { describe, expect, it } from 'vitest';
import { escapeHtml, fillTemplate, formatDate, formatFindingIdRefs, formatNumber } from './html-utils.js';

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

describe('formatNumber', () => {
  it('groups French thousands with a narrow no-break space (U+202F), matching the verified prototype (D27)', () => {
    const formatted = formatNumber(16490, 'fr');
    expect(formatted).toBe('16 490');
  });

  it('groups English thousands with a comma', () => {
    expect(formatNumber(16490, 'en')).toBe('16,490');
  });

  it('leaves a small number unchanged in both languages', () => {
    expect(formatNumber(42, 'fr')).toBe('42');
    expect(formatNumber(42, 'en')).toBe('42');
  });
});

describe('fillTemplate', () => {
  it('replaces every occurrence of a placeholder', () => {
    expect(fillTemplate('{n} of {n} pages', { n: 5 })).toBe('5 of 5 pages');
  });

  it('replaces multiple distinct placeholders', () => {
    expect(fillTemplate('{a} sur {b}', { a: 18, b: 20 })).toBe('18 sur 20');
  });
});

describe('formatFindingIdRefs', () => {
  it('collapses a run of three or more consecutive IDs into a range', () => {
    expect(formatFindingIdRefs(['f004', 'f005', 'f006', 'f007', 'f008'])).toBe('f004-f008');
  });

  it('keeps a run of exactly two as a comma list, not a range', () => {
    expect(formatFindingIdRefs(['f004', 'f005'])).toBe('f004, f005');
  });

  it('mixes ranges and singletons matching the prototype reference style', () => {
    expect(
      formatFindingIdRefs(['f001', 'f004', 'f005', 'f006', 'f007', 'f008', 'f010', 'f011', 'f014', 'f015', 'f016', 'f017', 'f018', 'f021', 'f022']),
    ).toBe('f001, f004-f008, f010, f011, f014-f018, f021, f022');
  });

  it('sorts unordered input before grouping', () => {
    expect(formatFindingIdRefs(['f008', 'f004', 'f006', 'f005', 'f007'])).toBe('f004-f008');
  });

  it('returns an empty string for no IDs', () => {
    expect(formatFindingIdRefs([])).toBe('');
  });
});
