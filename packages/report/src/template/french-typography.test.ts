import { describe, expect, it } from 'vitest';
import {
  frenchCopy,
  normalizeFrenchTypography,
  normalizeFrenchTypographyDeep,
  setFrenchProseApostrophes,
  preserveFrenchOrdinalCase,
} from './french-typography.js';

const NBSP = ' ';

describe('normalizeFrenchTypography', () => {
  it('keeps n° on the same line as its number', () => {
    expect(normalizeFrenchTypography('loi n° 2023-171')).toBe('loi n°\u00a02023-171');
  });

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

describe('setFrenchProseApostrophes', () => {
  it('sets escaped and raw straight apostrophes in prose text as ’', () => {
    expect(setFrenchProseApostrophes("<p>SOCIETE DU GRAND HOTEL DE L&#39;OPERA, l'hôtel</p>")).toBe(
      '<p>SOCIETE DU GRAND HOTEL DE L’OPERA, l’hôtel</p>',
    );
  });

  it('leaves code, snippets, monospace and verbatim evidence as the site wrote them', () => {
    const html =
      '<pre><code>alt=&#39;l&#39;hôtel&#39;</code></pre><span class="mono theme-rule-id">d&#39;x</span><span data-render-lint="verbatim">l&#39;url</span><style>a[b=\'c\']{}</style>';
    expect(setFrenchProseApostrophes(html)).toBe(html);
  });

  it('resumes after a verbatim element closes, and never touches attributes', () => {
    expect(
      setFrenchProseApostrophes(
        '<div><code>d&#39;a</code> l&#39;accès <img alt="l&#39;hôtel" /> <br> d&#39;un</div>',
      ),
    ).toBe('<div><code>d&#39;a</code> l’accès <img alt="l&#39;hôtel" /> <br> d’un</div>');
  });

  it('keeps a quote delimiter that does not sit between two letters', () => {
    expect(setFrenchProseApostrophes("<p>'Chambre' et l'hôtel</p>")).toBe(
      "<p>'Chambre' et l’hôtel</p>",
    );
  });
});
