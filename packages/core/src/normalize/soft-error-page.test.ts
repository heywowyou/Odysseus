import { describe, expect, it } from 'vitest';
import { isSoftErrorPage } from './page-verdict.js';

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

  it('catches an error page whose URL says nothing, from its title and heading', () => {
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
  });

  it('keeps a page with an error title and no heading (plan 075 L1)', () => {
    // aflatta, 2026-09-29: the gift vouchers (« Bon 100€ … OFFRIR ») and the
    // cart carry the same « Page introuvable » title and no heading.
    for (const url of [
      'https://www.aflatta.com/detail-produit/14',
      'https://www.aflatta.com/panier',
    ]) {
      expect(isSoftErrorPage(page(url, 'Page introuvable', []))).toBe(false);
    }
  });

  it('still catches the stored true error pages', () => {
    // haaitza and lacoorniche: error slug; domaine-d-auriac: error heading.
    expect(
      isSoftErrorPage(
        page('https://lacoorniche.com/erreur-404', 'Erreur 404 - La Co(o)rniche', [
          { level: 1, text: 'Page 404' },
        ]),
      ),
    ).toBe(true);
    expect(
      isSoftErrorPage(
        page('https://domaine-d-auriac.fr/404-2', "404 - Domaine d'Auriac", [
          { level: 1, text: 'Erreur 404, page non trouvée' },
        ]),
      ),
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
