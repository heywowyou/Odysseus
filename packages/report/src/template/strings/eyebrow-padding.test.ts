/**
 * B4 regression, updated for report-feedback-palais-gallien.md items 2-4:
 * every numbered section eyebrow ("03 · ...") must be zero-padded to two
 * digits. fr.ts once had "3 · L'audit en chiffres" while every other
 * section, and the en.ts equivalent, used two digits.
 *
 * The ordinal used to be baked into each of these 14x2 hand-typed
 * strings, which is exactly the kind of per-copy duplication that let a
 * section (Observations) go missing from the body while the TOC still
 * numbered everything after it as if it were there (item 2). The ordinal
 * is now computed once, in renderSheetHeader (html-utils.ts) from
 * whichever sections actually rendered (section-registry.ts), so this
 * test now asserts the zero-padding on renderSheetHeader's own output,
 * and separately asserts the source strings no longer carry a duplicate,
 * driftable copy of the number at all.
 */
import { describe, expect, it } from 'vitest';
import { en } from './en.js';
import { fr } from './fr.js';
import type { ReportStrings } from './types.js';
import { renderSheetHeader } from '../html-utils.js';
import { SECTION_IDS, computeSectionNumbers } from '../section-registry.js';

const LEADING_NUMBER_PATTERN = /^\d{1,2}\s*·/;

/** toc's own eyebrow ("Sommaire"/"Contents") is unnumbered chrome, not one
 *  of the fourteen numbered sections it lists - excluded on purpose. */
const UNNUMBERED_SECTIONS = new Set(['toc']);

function collectEyebrows(strings: ReportStrings): { section: string; eyebrow: string }[] {
  return Object.entries(strings)
    .filter((entry): entry is [string, { eyebrow: string }] => {
      const [section, value] = entry;
      return (
        !UNNUMBERED_SECTIONS.has(section) &&
        typeof value === 'object' &&
        value !== null &&
        'eyebrow' in value &&
        typeof value.eyebrow === 'string'
      );
    })
    .map(([section, value]) => ({ section, eyebrow: value.eyebrow }));
}

describe('section eyebrow strings carry no hand-typed ordinal (item 3)', () => {
  it.each(collectEyebrows(fr))('fr $section eyebrow "$eyebrow" has no leading number', ({ eyebrow }) => {
    expect(eyebrow).not.toMatch(LEADING_NUMBER_PATTERN);
  });

  it.each(collectEyebrows(en))('en $section eyebrow "$eyebrow" has no leading number', ({ eyebrow }) => {
    expect(eyebrow).not.toMatch(LEADING_NUMBER_PATTERN);
  });
});

describe('renderSheetHeader zero-pads whatever ordinal it is given', () => {
  it('pads a single-digit ordinal to two digits', () => {
    const html = renderSheetHeader(3, "L'audit en chiffres", 'Heading');
    expect(html).toContain('03 · ');
    expect(html).not.toContain('>3 · ');
  });

  it('does not pad a two-digit ordinal further', () => {
    const html = renderSheetHeader(12, 'Annexe', 'Heading');
    expect(html).toContain('12 · ');
  });
});

describe('section-registry numbers every included section contiguously from 1', () => {
  it('assigns 1..14 in order when all 14 sections are included', () => {
    const numbers = computeSectionNumbers(new Set(SECTION_IDS));
    SECTION_IDS.forEach((id, index) => {
      expect(numbers.get(id)).toBe(index + 1);
    });
  });
});
