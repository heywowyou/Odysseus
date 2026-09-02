import { describe, expect, it } from 'vitest';
import { renderToc } from './toc.js';
import { getStrings } from '../strings/i18n.js';
import { SECTION_IDS, type SectionId } from '../section-registry.js';

const ALL_SECTIONS = new Set<SectionId>(SECTION_IDS);

describe('renderToc', () => {
  it('numbers all 16 entries in order, starting at 1, when every section is included', () => {
    const html = renderToc(getStrings('fr'), ALL_SECTIONS);

    for (let i = 1; i <= 16; i++) {
      expect(html).toContain(
        `class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${i}</span>`,
      );
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

    for (let i = 0; i <= 14; i++) {
      const id = `section-${String(i).padStart(2, '0')}`;
      expect(html).toContain(`href="#${id}"`);
    }
    // The page-number pseudo-element now lives on the anchor itself
    // (class="toc-row"), not on a separate sibling span that never
    // carried the href attr() reads from - see paged.css.
    expect((html.match(/class="toc-row"/g) ?? []).length).toBe(16);
  });

  it('B8: drops the old "page numbers are in the footer" footnote', () => {
    const html = renderToc(getStrings('fr'), ALL_SECTIONS);
    expect(html).not.toContain('signets du fichier PDF');
  });

  // Plan 024's glossary-last reversal: the TOC's trailing groups must read
  // methodology, then technical appendix, then glossary, and the final
  // group must hold only the glossary row, in both languages.
  describe('plan 024: the trailing groups read methodology, appendix, glossary last', () => {
    const assertTrailingGroupOrder = (html: string): void => {
      const methodIdx = html.indexOf('>Méthode et vocabulaire</h5>');
      const appendixIdx = html.indexOf('>Annexe technique</h5>');
      const glossaryIdx = html.indexOf('>Glossaire</h5>');
      expect(methodIdx).toBeGreaterThan(-1);
      expect(appendixIdx).toBeGreaterThan(methodIdx);
      expect(glossaryIdx).toBeGreaterThan(appendixIdx);
    };

    it('orders the three trailing groups and closes with a glossary-only group (fr)', () => {
      const html = renderToc(getStrings('fr'), ALL_SECTIONS);
      assertTrailingGroupOrder(html);
      const tail = html.slice(html.indexOf('>Glossaire</h5>'));
      expect(tail).toContain('href="#section-13"');
      expect(tail).not.toContain('href="#section-12"');
      expect((tail.match(/href="#section-/g) ?? []).length).toBe(1);
    });

    it('orders the three trailing groups and closes with a glossary-only group (en)', () => {
      const html = renderToc(getStrings('en'), ALL_SECTIONS);
      const methodIdx = html.indexOf('>Method and vocabulary</h5>');
      const appendixIdx = html.indexOf('>Technical appendix</h5>');
      const glossaryIdx = html.indexOf('>Glossary</h5>');
      expect(methodIdx).toBeGreaterThan(-1);
      expect(appendixIdx).toBeGreaterThan(methodIdx);
      expect(glossaryIdx).toBeGreaterThan(appendixIdx);
      const tail = html.slice(html.indexOf('>Glossary</h5>'));
      expect(tail).toContain('href="#section-13"');
      expect(tail).not.toContain('href="#section-12"');
      expect((tail.match(/href="#section-/g) ?? []).length).toBe(1);
    });

    it('the glossary row is the 16th and last row', () => {
      const html = renderToc(getStrings('fr'), ALL_SECTIONS);
      const glossaryAnchor = html.indexOf('href="#section-13"');
      const rowStart = html.lastIndexOf(
        '<div style="display:flex;align-items:baseline',
        glossaryAnchor,
      );
      const row = html.slice(rowStart, glossaryAnchor);
      expect(/flex:none">(\d+)<\/span>/.exec(row)?.[1]).toBe('16');
      expect(html.lastIndexOf('href="#section-')).toBe(glossaryAnchor);
    });
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

    it('renumbers every section after the gap so the sequence stays contiguous 1..15', () => {
      const html = renderToc(getStrings('fr'), withoutObservations);
      for (let i = 1; i <= 15; i++) {
        expect(html).toContain(
          `class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${i}</span>`,
        );
      }
      expect(html).not.toContain(
        'class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">16</span>',
      );
    });

    // Stated relative to the unsuppressed render rather than as a literal
    // ordinal: adding a section ahead of section-07 changes the number without
    // changing the property under test, which is that suppressing exactly one
    // earlier section shifts everything after it up by exactly one.
    it('the row after the gap (section-07) shifts up by exactly one', () => {
      const html = renderToc(getStrings('fr'), withoutObservations);
      const section07Index = html.indexOf('href="#section-07"');
      const rowStart = html.lastIndexOf(
        '<div style="display:flex;align-items:baseline',
        section07Index,
      );
      const row = html.slice(rowStart, section07Index);
      const fullHtml = renderToc(getStrings('fr'), new Set(SECTION_IDS));
      const fullIndex = fullHtml.indexOf('href="#section-07"');
      const fullRow = fullHtml.slice(
        fullHtml.lastIndexOf('<div style="display:flex;align-items:baseline', fullIndex),
        fullIndex,
      );
      const ordinalIn = (rowHtml: string): number =>
        Number(/flex:none">(\d+)<\/span>/.exec(rowHtml)?.[1] ?? '0');
      expect(ordinalIn(row)).toBe(ordinalIn(fullRow) - 1);
    });
  });
});
