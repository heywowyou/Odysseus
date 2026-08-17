/**
 * B4 regression: every numbered section eyebrow ("03 · ...") must be
 * zero-padded to two digits. fr.ts once had "3 · L'audit en chiffres"
 * while every other section, and the en.ts equivalent, used two digits.
 */
import { describe, expect, it } from 'vitest';
import { en } from './en.js';
import { fr } from './fr.js';
import type { ReportStrings } from './types.js';

const EYEBROW_PATTERN = /^\d{2} · /;

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

describe('numbered section eyebrows are zero-padded to two digits', () => {
  it.each(collectEyebrows(fr))('fr $section eyebrow "$eyebrow"', ({ eyebrow }) => {
    expect(eyebrow).toMatch(EYEBROW_PATTERN);
  });

  it.each(collectEyebrows(en))('en $section eyebrow "$eyebrow"', ({ eyebrow }) => {
    expect(eyebrow).toMatch(EYEBROW_PATTERN);
  });
});
