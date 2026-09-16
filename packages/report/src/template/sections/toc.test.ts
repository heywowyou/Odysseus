import { describe, expect, it } from 'vitest';
import { renderToc } from './toc.js';
import { getStrings } from '../strings/i18n.js';
import { SECTION_IDS, type SectionId } from '../section-registry.js';

const ALL_SECTIONS = new Set<SectionId>(SECTION_IDS);

describe('renderToc', () => {
  it('numbers all 18 entries in order, starting at 1, when every section is included', () => {
    const html = renderToc(getStrings('fr'), ALL_SECTIONS);

    for (let i = 1; i <= 18; i++) {
      expect(html).toContain(
        `class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${i}</span>`,
      );
    }
  });

  it('renders in the requested language', () => {
    const htmlFr = renderToc(getStrings('fr'), ALL_SECTIONS);
    const htmlEn = renderToc(getStrings('en'), ALL_SECTIONS);

    expect(htmlFr).toContain('Cadre réglementaire');
    expect(htmlEn).toContain('Legal exposure');
    expect(htmlEn).not.toContain('Cadre réglementaire');
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
    expect((html.match(/class="toc-row"/g) ?? []).length).toBe(18);
  });

  it('B8: drops the old "page numbers are in the footer" footnote', () => {
    const html = renderToc(getStrings('fr'), ALL_SECTIONS);
    expect(html).not.toContain('signets du fichier PDF');
  });

  // Issue #336: five reader-facing groups, in document order. Plan 024's
  // glossary-last rule still holds inside the closing Annexes group.
  describe('issue #336: the TOC reads five groups and closes on the glossary', () => {
    it.each([
      ['fr', ['Vue d’ensemble', 'Actions prioritaires', 'Résultats détaillés', 'Annexes']],
      [
        'en',
        ['Overview', 'Priority actions', 'Detailed results', 'Regulatory framework', 'Appendices'],
      ],
    ] as const)('renders the five groups in order (%s)', (language, labels) => {
      const html = renderToc(getStrings(language), ALL_SECTIONS);
      const groupLabels = [...html.matchAll(/<h5[^>]*>([^<]*)<\/h5>/gu)].map((m) =>
        m[1]!.replace(/&#39;/gu, "'"),
      );
      expect(groupLabels).toEqual(labels);
      const tail = html.slice(html.lastIndexOf('</h5>'));
      expect([...tail.matchAll(/href="#(section-[0-9b]+)"/gu)].map((m) => m[1])).toEqual([
        'section-11',
        'section-12',
        'section-13',
      ]);
    });

    it('issue #333: a one-row group named like its row does not print the name twice', () => {
      const html = renderToc(getStrings('fr'), ALL_SECTIONS);
      expect(html.split('Cadre réglementaire').length - 1).toBe(1);
      expect(html).toContain('href="#section-02"');
    });

    it('issue #333: a group keeps its label when its one row has a different name', () => {
      const html = renderToc(getStrings('en'), ALL_SECTIONS);
      expect(html).toContain('>Regulatory framework</h5>');
    });

    it('never uses the retired French group or section labels', () => {
      const html = renderToc(getStrings('fr'), ALL_SECTIONS);
      for (const retired of [
        'Contexte exécutif',
        'Synthèse finale',
        'Exposition légale',
        'Check-list imprimable',
        'Preuve de rendu',
        '>Référentiel<',
        'Reste à traiter',
      ]) {
        expect(html).not.toContain(retired);
      }
    });

    it('the glossary row is the 18th and last row', () => {
      const html = renderToc(getStrings('fr'), ALL_SECTIONS);
      const glossaryAnchor = html.indexOf('href="#section-13"');
      const rowStart = html.lastIndexOf(
        '<div style="display:flex;align-items:baseline',
        glossaryAnchor,
      );
      const row = html.slice(rowStart, glossaryAnchor);
      expect(/flex:none">(\d+)<\/span>/.exec(row)?.[1]).toBe('18');
      expect(html.lastIndexOf('href="#section-')).toBe(glossaryAnchor);
    });
  });

  // Issue #49: section-14 (Prochaines étapes) used to be listed inside the
  // early "Décisions et actions" group although the body renders it after
  // every evidence section, so the TOC's ordinals read 4, 5, 6, 12, then
  // 7, 8, 9 - visibly out of order on the report's first navigation page.
  // The regression class is "any group membership that stops the rendered
  // ordinals being monotonic top to bottom", so that is what is asserted,
  // not one group's contents.
  describe('issue #49: the rendered ordinals never run backwards down the page', () => {
    function ordinalsInRenderOrder(html: string): number[] {
      return [...html.matchAll(/flex:none">(\d+)<\/span>/gu)].map((m) => Number(m[1]));
    }

    it('is strictly increasing by 1, top to bottom, when every section is included (fr)', () => {
      const ordinals = ordinalsInRenderOrder(renderToc(getStrings('fr'), ALL_SECTIONS));
      expect(ordinals).toHaveLength(SECTION_IDS.length);
      expect(ordinals).toEqual(ordinals.map((_, i) => i + 1));
    });

    it('is strictly increasing by 1, top to bottom, when every section is included (en)', () => {
      const ordinals = ordinalsInRenderOrder(renderToc(getStrings('en'), ALL_SECTIONS));
      expect(ordinals).toEqual(ordinals.map((_, i) => i + 1));
    });

    it('is still monotonic when a middle section is suppressed', () => {
      const withoutObservations = new Set(ALL_SECTIONS);
      withoutObservations.delete('section-06');
      const ordinals = ordinalsInRenderOrder(renderToc(getStrings('fr'), withoutObservations));
      expect(ordinals).toEqual(ordinals.map((_, i) => i + 1));
    });

    it("the next-steps row's ordinal is greater than every evidence section's, matching the body order", () => {
      const html = renderToc(getStrings('fr'), ALL_SECTIONS);
      const ordinalOf = (id: SectionId): number => {
        const anchor = html.indexOf(`href="#${id}"`);
        const row = html.slice(
          html.lastIndexOf('<div style="display:flex;align-items:baseline', anchor),
          anchor,
        );
        return Number(/flex:none">(\d+)<\/span>/.exec(row)?.[1]);
      };
      for (const evidenceId of [
        'section-06',
        'section-07',
        'section-08',
        'section-09',
        'section-15',
        'section-10',
      ] as const) {
        expect(ordinalOf('section-14')).toBeGreaterThan(ordinalOf(evidenceId));
      }
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

    it('renumbers every section after the gap so the sequence stays contiguous 1..17', () => {
      const html = renderToc(getStrings('fr'), withoutObservations);
      for (let i = 1; i <= 17; i++) {
        expect(html).toContain(
          `class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">${i}</span>`,
        );
      }
      expect(html).not.toContain(
        'class="n" style="font-size:12px;color:var(--color-accent-300);width:22px;flex:none">18</span>',
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
