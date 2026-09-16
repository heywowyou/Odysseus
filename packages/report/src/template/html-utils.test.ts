import { describe, expect, it, vi } from 'vitest';
import {
  escapeHtml,
  fillTemplate,
  formatDate,
  formatCappedFindingIdLinks,
  formatCappedFindingIdRefs,
  formatCappedList,
  formatFindingIdLinks,
  formatFindingIdRefs,
  formatNumber,
} from './html-utils.js';
import { en } from './strings/en.js';
import { fr } from './strings/fr.js';

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
  // B9 (report-feedback-haaitza.md): always comma-separated, never a range
  // notation - an earlier version collapsed runs of 3+ consecutive ids
  // into "f004-f008", which read as inconsistent next to every other
  // priority's comma-separated list on the same page.
  it('always comma-separates, even for a long run of consecutive IDs', () => {
    expect(formatFindingIdRefs(['f004', 'f005', 'f006', 'f007', 'f008'])).toBe(
      'f004, f005, f006, f007, f008',
    );
  });

  it('keeps a run of exactly two as a comma list', () => {
    expect(formatFindingIdRefs(['f004', 'f005'])).toBe('f004, f005');
  });

  it('sorts unordered input before joining', () => {
    expect(formatFindingIdRefs(['f008', 'f004', 'f006', 'f005', 'f007'])).toBe(
      'f004, f005, f006, f007, f008',
    );
  });

  it('returns an empty string for no IDs', () => {
    expect(formatFindingIdRefs([])).toBe('');
  });
});

describe('formatFindingIdLinks', () => {
  // item 3.3: a theme card's "Constats : f002, f003" used to be plain
  // text with no page number and no link - each id now links to
  // #annexref-{id}, the anchor findings-appendix.ts sets on every annex row.
  it('wraps each id in an anchor pointing at #annexref-{id}, sorted and comma-separated', () => {
    expect(formatFindingIdLinks(['f008', 'f004'])).toBe(
      '<a href="#annexref-f004" style="color:inherit;text-decoration:underline">f004</a>, ' +
        '<a href="#annexref-f008" style="color:inherit;text-decoration:underline">f008</a>',
    );
  });

  it('escapes a finding id so injected markup cannot execute', () => {
    const html = formatFindingIdLinks(['"><script>alert(1)</script>']);
    expect(html).not.toContain('<script>');
  });

  it('returns an empty string for no IDs', () => {
    expect(formatFindingIdLinks([])).toBe('');
  });
});

// Issue #321: the separator before the capped list's "et N autres" /
// "and N more" tail used to be a plain space on a text-run boundary, which
// print-to-PDF dropped ("f030et 20 autres", "f011and 154 more"). These tests
// pin a no-break space in the exact reported shapes, outside every linked or
// muted span.
describe('capped lists keep a rendered space before the "and N more" tail', () => {
  /** f001..f{n}, unsorted input included on purpose (helpers sort). */
  function ids(count: number): string[] {
    return Array.from({ length: count }, (_, i) => `f${String(i + 1).padStart(3, '0')}`).reverse();
  }

  it('formatCappedFindingIdRefs separates the French tail with a no-break space (the reported "f030 et 20 autres" shape)', () => {
    expect(formatCappedFindingIdRefs(ids(30), 'fr', fr.findingsAppendix)).toBe(
      'f001, f002, f003, f004, f005, f006, f007, f008, f009, f010\u00a0et 20 autres',
    );
  });

  it('formatCappedFindingIdRefs separates the English singular tail with a no-break space', () => {
    expect(formatCappedFindingIdRefs(ids(11), 'en', en.findingsAppendix)).toBe(
      'f001, f002, f003, f004, f005, f006, f007, f008, f009, f010\u00a0and 1 more',
    );
  });

  it('formatCappedList separates the tail with a no-break space', () => {
    expect(formatCappedList(['A', 'B', 'C', 'D'], 3, 'fr', fr.findingsAppendix)).toBe(
      'A, B, C\u00a0et 1 autre',
    );
  });

  it('formatCappedFindingIdLinks puts the no-break space outside the anchor and the muted span (the reported "f011 and 154 more" shape)', () => {
    const html = formatCappedFindingIdLinks(ids(164), 'en', en.findingsAppendix);
    expect(html).toContain('>f010</a>\u00a0<span class="text-muted">and 154 more</span>');
    // No plain space may sit on the link-to-tail boundary, and the tail may
    // never ride inside a linked or underlined span.
    expect(html).not.toContain('</a> <span');
    expect(html).not.toContain('more</a>');
  });

  it('formatCappedFindingIdLinks renders the French tail verbatim after the last link', () => {
    const html = formatCappedFindingIdLinks(ids(30), 'fr', fr.findingsAppendix);
    expect(html).toContain('>f010</a>\u00a0<span class="text-muted">et 20 autres</span>');
  });

  it('leaves an uncapped list untouched by any tail', () => {
    expect(formatCappedFindingIdRefs(['f002', 'f001'], 'fr', fr.findingsAppendix)).toBe(
      'f001, f002',
    );
    expect(formatCappedList(['A', 'B'], 3, 'fr', fr.findingsAppendix)).toBe('A, B');
  });
});

describe('report issuer configuration', () => {
  it('uses the SIRET key loaded from the repository environment file', async () => {
    const originalSiret = process.env['SIRET'];
    const originalOdysseusSiret = process.env['ODYSSEUS_SIRET'];
    process.env['SIRET'] = '12345678901234';
    delete process.env['ODYSSEUS_SIRET'];
    vi.resetModules();

    try {
      const { ODYSSEUS_REGISTRATION_NUMBER } = await import('./html-utils.js');
      expect(ODYSSEUS_REGISTRATION_NUMBER).toBe('12345678901234');
    } finally {
      if (originalSiret === undefined) delete process.env['SIRET'];
      else process.env['SIRET'] = originalSiret;
      if (originalOdysseusSiret === undefined) delete process.env['ODYSSEUS_SIRET'];
      else process.env['ODYSSEUS_SIRET'] = originalOdysseusSiret;
      vi.resetModules();
    }
  });
});
