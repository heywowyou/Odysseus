import { describe, expect, it } from 'vitest';
import { findRenderLintViolations } from './render-lint.js';

describe('findRenderLintViolations', () => {
  it('flags an unfilled template placeholder', () => {
    expect(
      findRenderLintViolations('<p>Manquant : {{percent}}%</p>').map((v) => v.label),
    ).toContain('unresolved template placeholder "{{"');
  });

  it('flags the B2 shape: a sentence ending in a placeholder hyphen', () => {
    const violations = findRenderLintViolations(
      '<p>Manquant : 100% du texte visible absent du HTML brut, sur -.</p>',
    );
    expect(violations.map((v) => v.label)).toContain(
      'placeholder hyphen before a sentence-ending period',
    );
  });

  it('flags a stringified undefined/null/NaN/[object Object]', () => {
    expect(findRenderLintViolations('<p>undefined</p>').length).toBeGreaterThan(0);
    expect(findRenderLintViolations('<p>Valeur : null</p>').length).toBeGreaterThan(0);
    expect(findRenderLintViolations('<p>NaN%</p>').length).toBeGreaterThan(0);
    expect(findRenderLintViolations('<p>[object Object]</p>').length).toBeGreaterThan(0);
  });

  // report-feedback-la-corniche.md item 3.2: a real report shipped
  // "1 page(s) ont été exclues", a pluralisation placeholder left
  // unresolved rather than picking a real singular/plural form.
  it('flags an unresolved "(s)" pluralisation placeholder', () => {
    const violations = findRenderLintViolations('<p>1 page(s) ont été exclues de ce scan.</p>');
    expect(violations.map((v) => v.label)).toContain('unresolved pluralisation placeholder "(s)"');
  });

  // P0.4 (2026-08-21 La Corniche feedback pass): "[SIRET à renseigner]"
  // (ODYSSEUS_SIRET_PLACEHOLDER) reached a real client-facing PDF.
  it('flags the "[SIRET à renseigner]" placeholder', () => {
    const violations = findRenderLintViolations(
      '<p>Signataire : Jules Fontaine. SIRET : [SIRET à renseigner].</p>',
    );
    expect(violations.map((v) => v.label)).toContain('unfilled "[... à renseigner]" placeholder');
  });

  it('flags any other field using the same "[... à renseigner]" placeholder convention', () => {
    const violations = findRenderLintViolations('<p>[TVA à renseigner]</p>');
    expect(violations.map((v) => v.label)).toContain('unfilled "[... à renseigner]" placeholder');
  });

  it('finds nothing wrong with clean, complete French copy', () => {
    expect(
      findRenderLintViolations(
        '<p>Manquant : 12% du texte visible absent du HTML brut, sur .hero-copy.</p>',
      ),
    ).toEqual([]);
    expect(
      findRenderLintViolations('<p>Signataire : Jules Fontaine. SIRET : 552032534.</p>'),
    ).toEqual([]);
  });
});

// A6 (2026-08-24 three-site review): both strings are verbatim from real
// client reports.
describe('A6: leaked markdown emphasis', () => {
  it('flags the real La Corniche and Haaitza strings', () => {
    expect(
      findRenderLintViolations('<p>des liens *hreflang* non réciproques</p>').map((v) => v.label),
    ).toContain('leaked markdown emphasis in rendered prose');
    expect(
      findRenderLintViolations('<p>ajouter un attribut *aria-label* à chaque bouton</p>').map(
        (v) => v.label,
      ),
    ).toContain('leaked markdown emphasis in rendered prose');
  });

  it('flags bold and underscore emphasis too', () => {
    expect(findRenderLintViolations('<p>un point **important** ici</p>').length).toBeGreaterThan(0);
    expect(findRenderLintViolations('<p>un point __important__ ici</p>').length).toBeGreaterThan(0);
  });

  it('does not flag a lone asterisk, a star rating, or ordinary prose', () => {
    const clean = (html: string) =>
      findRenderLintViolations(html).filter(
        (v) => v.label === 'leaked markdown emphasis in rendered prose',
      );
    expect(clean('<p>Hôtel Le Palais Gallien 5***** - Bordeaux</p>')).toEqual([]);
    expect(clean('<p>Les temps de chargement sont trop longs sur 23 pages.</p>')).toEqual([]);
    expect(clean('<p>Contactez-nous à contact@odysseusaudit.com.</p>')).toEqual([]);
  });

  // Issue #70: a real audit's Lighthouse finding evidence listed a Next.js
  // chunk filename in a url-cell, which the underscore-emphasis pattern
  // matched across the intervening path as if it were emphasis.
  it('does not flag a path-like span between two unrelated underscores', () => {
    const clean = (html: string) =>
      findRenderLintViolations(html).filter(
        (v) => v.label === 'leaked markdown emphasis in rendered prose',
      );
    expect(
      clean(
        '<div class="url-cell">Fichiers : /_next/static/immutable/chunks/0vw0c0r7hvkh_.js</div>',
      ),
    ).toEqual([]);
  });
});

describe('A6: prose rules never scan style or script bodies', () => {
  it('ignores a snake_case class name in a stylesheet', () => {
    const html =
      '<style>.pagedjs_page_content > div { height: 100%; }</style><p>Rien à signaler.</p>';
    expect(findRenderLintViolations(html)).toEqual([]);
  });

  it('ignores an asterisk inside a script', () => {
    expect(
      findRenderLintViolations('<script>const a = b * c * d;</script><p>Bonjour.</p>'),
    ).toEqual([]);
  });

  it('still flags emphasis in the prose next to them', () => {
    const html =
      '<style>.pagedjs_page_content{}</style><p>des liens *hreflang* non réciproques</p>';
    expect(findRenderLintViolations(html).map((v) => v.label)).toContain(
      'leaked markdown emphasis in rendered prose',
    );
  });
});
