import { describe, expect, it } from 'vitest';
import { findRenderLintViolations, VERBATIM_EVIDENCE_ATTRIBUTE } from './render-lint.js';

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

  it('flags a "?" standing in for an unmeasured number next to a unit', () => {
    const label = 'placeholder "?" in place of an unmeasured number';
    for (const text of [
      'HTML brut - ? caractères',
      'Occurrences : ? occurrences',
      'Constats : ? constats',
      'Pages : ? pages',
      'Couverture : ?%',
      'Couverture : ? %',
    ]) {
      expect(findRenderLintViolations(`<p>${text}</p>`).map((v) => v.label)).toContain(label);
    }
  });

  // Issue #385: a URL query string is not a numeric placeholder.
  it('does not mistake a URL query string or a real question for a "?" placeholder', () => {
    for (const text of [
      'https://www.hotelchateauroyal.nc/en?page_id=15968',
      'https://example.com/?page=2',
      'https://example.com/?pages=2',
      'https://example.com/search?page=hotel',
      'https://example.com/?%C3%A9t%C3%A9=1',
      'https://example.com/? pagesjaunes',
      'Une question ?',
    ]) {
      expect(findRenderLintViolations(`<p>${text}</p>`)).toEqual([]);
    }
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

  // A real hotel site's Umbraco media paths wrap a segment in underscores.
  it('does not flag an underscore pair that is a whole path segment', () => {
    const clean = (html: string) =>
      findRenderLintViolations(html).filter(
        (v) => v.label === 'leaked markdown emphasis in rendered prose',
      );
    expect(
      clean(
        '<p>/media/840/_import_/721/_import_/838/7_7512266302033527624_n.jpg, /media/_x_/a.jpg</p>',
      ),
    ).toEqual([]);
    expect(clean('<p>un point _important_ ici</p>')).not.toEqual([]);
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

describe('issue #377: verbatim scanner evidence', () => {
  // The real audited site's own DOM carried a stringified object prop, so
  // axe's captured selector legitimately contains the text.
  const selector =
    '.jcLePU.sc-column[spacing=&quot;[object Object]&quot;]:nth-child(10) &gt; .item';

  it('does not flag a stringified object inside a marked selector cell', () => {
    const html = `<div ${VERBATIM_EVIDENCE_ATTRIBUTE} style="font-size:10px">${selector}</div><p>Rien.</p>`;
    expect(findRenderLintViolations(html)).toEqual([]);
  });

  it('still flags the same text outside a marked element', () => {
    const html = `<div style="font-size:10px">${selector}</div>`;
    expect(findRenderLintViolations(html).map((v) => v.label)).toContain('stringified object');
  });

  it('never lets a marker hide template output that follows it', () => {
    const html = `<code ${VERBATIM_EVIDENCE_ATTRIBUTE}>a[x=null]</code><p>Valeur : [object Object]</p>`;
    expect(findRenderLintViolations(html).map((v) => v.label)).toEqual(['stringified object']);
  });
});
