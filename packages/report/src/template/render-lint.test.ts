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

// Issue #408: the appendix cells quote the audited site's own URLs. They are
// not prose this renderer composed, and they tripped a prose rule three times
// in production - a query string read as a placeholder before a unit (#385),
// a chunk filename read as underscore emphasis (#70), and an Umbraco media
// path whose whole segment was wrapped in underscores. Each was fixed by
// widening a regex after a report was already blocked at the last step, with
// the scan and both analyses already paid for.
describe('A6: appendix URL evidence is not scanned as prose', () => {
  const hostile = [
    '/media/840/_import_/721/_import_/838/photo.jpg',
    'https://exemple.fr/?page_id=15968',
    'https://exemple.fr/_next/static/chunks/0vw0c0r7hvkh_.js',
    'https://exemple.fr/a--b/[object Object]/null',
  ].join(', ');

  it('passes a pages cell whose URLs would trip several rules', () => {
    const html = `<div class="url-cell">Pages : <span ${VERBATIM_EVIDENCE_ATTRIBUTE}>${hostile}</span></div>`;
    expect(findRenderLintViolations(html)).toEqual([]);
  });

  it('passes an affected-files cell the same way', () => {
    const html = `<div class="url-cell">Fichiers affectés : <span ${VERBATIM_EVIDENCE_ATTRIBUTE}>${hostile}</span></div>`;
    expect(findRenderLintViolations(html)).toEqual([]);
  });

  it('passes a crawled-pages list, whose items are marked one by one', () => {
    const items = hostile
      .split(', ')
      .map((url) => `<li ${VERBATIM_EVIDENCE_ATTRIBUTE}>${url}</li>`)
      .join('');
    expect(findRenderLintViolations(`<ul class="url-cell">${items}</ul>`)).toEqual([]);
  });

  // The whole point of splitting the label out of the marked element: the
  // prefix is renderer-composed and a leak there is still this renderer's bug.
  it('still catches a leak in the label next to a marked cell', () => {
    const html = `<div class="url-cell">Pages *importantes* : <span ${VERBATIM_EVIDENCE_ATTRIBUTE}>${hostile}</span></div>`;
    expect(findRenderLintViolations(html)).not.toEqual([]);
  });

  it('never lets a marker hide template markup that follows it', () => {
    const html = `<div class="url-cell">Pages : <span ${VERBATIM_EVIDENCE_ATTRIBUTE}>https://exemple.fr/a</span></div><p>un point _important_ ici</p>`;
    expect(findRenderLintViolations(html)).not.toEqual([]);
  });
});

describe('straight apostrophes in French prose', () => {
  const fr = (body: string) => `<html lang="fr"><body>${body}</body></html>`;

  it('catches an escaped straight apostrophe in a French paragraph', () => {
    const violations = findRenderLintViolations(fr('<p>L&#39;accessibilité ressort</p>'));
    expect(violations.map((v) => v.label)).toEqual(['straight apostrophe in French prose (use ’)']);
  });

  it('catches one in text that follows a closing tag', () => {
    const html = fr("<li><span>Texte alternatif</span> : ajoutez l'attribut</li>");
    expect(findRenderLintViolations(html)).not.toEqual([]);
  });

  it('passes typographic apostrophes', () => {
    expect(findRenderLintViolations(fr('<p>L’accessibilité de l’établissement</p>'))).toEqual([]);
  });

  it('passes code, preformatted snippets and monospace evidence', () => {
    const html = fr(
      '<pre><code>alt=&#39;Vue d&#39;ensemble&#39;</code></pre><span class="mono theme-rule-id">l&#39;id</span><code>aria-label=&#39;x&#39;</code>',
    );
    expect(findRenderLintViolations(html)).toEqual([]);
  });

  it('passes attribute values and English documents', () => {
    expect(findRenderLintViolations(fr('<img alt="l&#39;hôtel" />'))).toEqual([]);
    expect(
      findRenderLintViolations('<html lang="en"><body><p>The site&#39;s pages</p></body></html>'),
    ).toEqual([]);
  });
});
