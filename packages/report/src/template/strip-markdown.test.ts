import { describe, expect, it } from 'vitest';
import { escapeProse, stripInlineMarkdown } from './html-utils.js';

/**
 * A6 (2026-08-24 three-site review): the model emits valid JSON, as the
 * writing prompt demands, but reaches for inline emphasis inside field
 * values. Both headline strings are verbatim from real client reports.
 */
describe('stripInlineMarkdown', () => {
  it('removes the delimiters and keeps the text (real report strings)', () => {
    expect(stripInlineMarkdown('des liens *hreflang* non réciproques')).toBe(
      'des liens hreflang non réciproques',
    );
    expect(stripInlineMarkdown('ajouter un attribut *aria-label* à chaque bouton')).toBe(
      'ajouter un attribut aria-label à chaque bouton',
    );
  });

  it('handles bold, bold-italic, underscores and code spans', () => {
    expect(stripInlineMarkdown('un point **important**')).toBe('un point important');
    expect(stripInlineMarkdown('un point ***important***')).toBe('un point important');
    expect(stripInlineMarkdown('un point __important__')).toBe('un point important');
    expect(stripInlineMarkdown('la balise `<title>`')).toBe('la balise <title>');
  });

  it('leaves an unpaired asterisk alone, so a star rating survives', () => {
    expect(stripInlineMarkdown('Hôtel Le Palais Gallien 5***** - Bordeaux')).toBe(
      'Hôtel Le Palais Gallien 5***** - Bordeaux',
    );
  });

  it('leaves ordinary prose untouched', () => {
    const prose = 'Un site lent décourage les visiteurs et réduit les réservations en ligne.';
    expect(stripInlineMarkdown(prose)).toBe(prose);
  });

  it('escapeProse still escapes HTML after stripping', () => {
    expect(escapeProse('la balise `<title>` est *vide*')).toBe('la balise &lt;title&gt; est vide');
  });
});
