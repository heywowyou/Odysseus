import { describe, expect, it } from 'vitest';
import {
  frenchCopy,
  normalizeFrenchTypography,
  normalizeFrenchTypographyDeep,
  preserveFrenchOrdinalCase,
} from './french-typography.js';

const NBSP = ' ';

describe('normalizeFrenchTypography', () => {
  it('sets elision apostrophes as U+2019', () => {
    expect(normalizeFrenchTypography("l'usage n'est pas conforme")).toBe(
      'l’usage n’est pas conforme',
    );
  });

  it('pairs straight double quotes into guillemets with inner no-break spaces', () => {
    expect(normalizeFrenchTypography('le lien "En savoir plus" est ambigu')).toBe(
      `le lien «${NBSP}En savoir plus${NBSP}» est ambigu`,
    );
  });

  it('leaves quotes that delimit an attribute value alone, since the reader retypes them', () => {
    const markup = 'ajoutez <meta http-equiv="refresh"> au document';
    expect(normalizeFrenchTypography(markup)).toBe(markup);
  });

  it('puts a no-break space before a percentage, whether or not one was typed', () => {
    expect(normalizeFrenchTypography('78% puis 70,22 %')).toBe(`78${NBSP}% puis 70,22${NBSP}%`);
  });

  it('spaces a unit after a figure but not a CSS declaration value', () => {
    expect(normalizeFrenchTypography('au moins 24px')).toBe(`au moins 24${NBSP}px`);
    expect(normalizeFrenchTypography('font-size: 24px')).toBe('font-size: 24px');
  });

  it('makes the space before high punctuation unbreakable without inventing one', () => {
    expect(normalizeFrenchTypography('Et ensuite ? Voici : https://example.com/a')).toBe(
      `Et ensuite${NBSP}? Voici${NBSP}: https://example.com/a`,
    );
  });
});

describe('preserveFrenchOrdinalCase', () => {
  it('opts the ordinal suffix out of an enclosing uppercase transform', () => {
    expect(preserveFrenchOrdinalCase('75e percentile')).toBe(
      '75<span style="text-transform:none">e</span> percentile',
    );
  });

  it('leaves a figure without an ordinal suffix untouched', () => {
    expect(preserveFrenchOrdinalCase('24 px')).toBe('24 px');
  });
});

describe('normalizeFrenchTypographyDeep', () => {
  it('normalizes every string in a strings tree and preserves its shape', () => {
    expect(
      normalizeFrenchTypographyDeep({
        title: "l'accueil",
        items: ['couverture 78%', { note: 'Ensuite ?' }],
        count: 3,
      }),
    ).toEqual({
      title: 'l’accueil',
      items: [`couverture 78${NBSP}%`, { note: `Ensuite${NBSP}?` }],
      count: 3,
    });
  });
});

describe('frenchCopy', () => {
  it('normalizes French copy and leaves English copy verbatim', () => {
    expect(frenchCopy("l'audit", 'fr')).toBe('l’audit');
    expect(frenchCopy("the site's audit", 'en')).toBe("the site's audit");
  });
});
