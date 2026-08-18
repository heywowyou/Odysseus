import { describe, expect, it } from 'vitest';
import { renderToc } from './toc.js';
import { getStrings } from '../strings/i18n.js';
import { SECTION_IDS, type SectionId } from '../section-registry.js';

const ALL_SECTIONS = new Set<SectionId>(SECTION_IDS);

describe('renderToc', () => {
  it('numbers all 14 entries in order, starting at 1, when every section is included', () => {
    const html = renderToc(getStrings('fr'), ALL_SECTIONS);

    for (let i = 1; i <= 14; i++) {
      expect(html).toContain(`class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${i}</span>`);
    }
  });

  it('renders in the requested language', () => {
    const htmlFr = renderToc(getStrings('fr'), ALL_SECTIONS);
    const htmlEn = renderToc(getStrings('en'), ALL_SECTIONS);

    expect(htmlFr).toContain('Exposition légale');
    expect(htmlEn).toContain('Legal exposure');
    expect(htmlEn).not.toContain('Exposition légale');
  });

  it('B8: links each included row to its own section-NN id, via an anchor that itself carries the href target-counter reads (item 1)', () => {
    const html = renderToc(getStrings('fr'), ALL_SECTIONS);

    for (let i = 1; i <= 14; i++) {
      const id = `section-${String(i).padStart(2, '0')}`;
      expect(html).toContain(`href="#${id}"`);
    }
    // The page-number pseudo-element now lives on the anchor itself
    // (class="toc-row"), not on a separate sibling span that never
    // carried the href attr() reads from - see paged.css.
    expect((html.match(/class="toc-row"/g) ?? []).length).toBe(14);
  });

  it('B8: drops the old "page numbers are in the footer" footnote', () => {
    const html = renderToc(getStrings('fr'), ALL_SECTIONS);
    expect(html).not.toContain('signets du fichier PDF');
  });

  // item 2: a section suppressed for having no content (observations.ts,
  // section-06, when nothing was diverted) must disappear from the TOC
  // too, not just the body, and every later row must renumber to close
  // the gap rather than leaving a dead #section-06 anchor at row 6.
  describe('item 2: a suppressed section drops out of the TOC and renumbers what follows', () => {
    const withoutObservations = new Set(ALL_SECTIONS);
    withoutObservations.delete('section-06');

    it('omits the row entirely, no dead anchor to #section-06', () => {
      const html = renderToc(getStrings('fr'), withoutObservations);
      expect(html).not.toContain('href="#section-06"');
      expect(html).not.toContain('Observations');
    });

    it('renumbers every section after the gap so the sequence stays contiguous 1..13', () => {
      const html = renderToc(getStrings('fr'), withoutObservations);
      for (let i = 1; i <= 13; i++) {
        expect(html).toContain(`class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${i}</span>`);
      }
      expect(html).not.toContain(
        'class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">14</span>',
      );
    });

    it('the row after the gap (section-07) is now the 6th row, not the 7th', () => {
      const html = renderToc(getStrings('fr'), withoutObservations);
      const section07Index = html.indexOf('href="#section-07"');
      const rowStart = html.lastIndexOf('<div style="display:flex;align-items:baseline', section07Index);
      const row = html.slice(rowStart, section07Index);
      expect(row).toContain('>6</span>');
    });
  });
});
