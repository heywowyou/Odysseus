import { describe, expect, it } from 'vitest';
import { isSoftErrorPage } from './soft-error-page.js';

describe('isSoftErrorPage (issue #302)', () => {
  function page(
    url: string,
    title: string | null = 'Hôtel & Spa',
    headings = [{ level: 1, text: 'Bienvenue' }],
  ) {
    return { url, title, headings };
  }

  it('catches the reported error-template URLs, in every language variant', () => {
    for (const url of [
      'https://haaitza.com/erreur-404',
      'https://haaitza.com/en/erreur-404',
      'https://haaitza.com/es/erreur-404',
      'https://haaitza.com/it/erreur-404/',
    ]) {
      expect(isSoftErrorPage(page(url))).toBe(true);
    }
  });

  it('catches an error page whose URL says nothing, from its title', () => {
    expect(isSoftErrorPage(page('https://example.com/oups', '404 - Page introuvable', []))).toBe(
      true,
    );
    expect(
      isSoftErrorPage(
        page('https://example.com/oops', 'Page not found | Example', [
          { level: 2, text: 'Page not found' },
        ]),
      ),
    ).toBe(true);
  });

  it('keeps a content page whose title alone announces an error (plan 075 K4)', () => {
    // aflatta, 2026-09-28: the shop template titled each offer page
    // « Page introuvable » above the offer itself.
    expect(
      isSoftErrorPage(
        page('https://www.aflatta.com/detail-produit/1', 'Page introuvable', [
          { level: 2, text: 'Pour  2 personnes' },
        ]),
      ),
    ).toBe(false);
    // The same template with no offer behind it is an error page.
    expect(
      isSoftErrorPage(page('https://www.aflatta.com/detail-produit/13', 'Page introuvable', [])),
    ).toBe(true);
  });

  it('catches one announced only in its h1', () => {
    expect(
      isSoftErrorPage(
        page('https://example.com/oups', 'Example', [{ level: 1, text: 'Erreur 404' }]),
      ),
    ).toBe(true);
  });

  it('leaves an ordinary page alone', () => {
    expect(isSoftErrorPage(page('https://haaitza.com/chambres'))).toBe(false);
    expect(isSoftErrorPage(page('https://haaitza.com/', null, []))).toBe(false);
  });

  it('does not match an error slug appearing inside a longer segment', () => {
    // A real article about avoiding broken links is not an error page.
    expect(isSoftErrorPage(page('https://example.com/blog/eviter-les-erreurs-404'))).toBe(false);
  });

  it('does not match a title that merely mentions the code', () => {
    expect(
      isSoftErrorPage(page('https://example.com/blog/seo', 'Comment corriger une erreur 404')),
    ).toBe(false);
  });
});
