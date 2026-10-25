import { describe, expect, it } from 'vitest';
import {
  isWrittenWithTrailingSlash,
  slashedSpelling,
  globToRegExp,
  classifyNonPublicPluginObject,
  isLanguageHomepagePath,
  normalizeInternalLinks,
  normalizePageIdentityUrl,
  normalizePageUrl,
} from './links.js';

const BASE = 'https://client.example/current-page';

describe('normalizeInternalLinks', () => {
  it('resolves relative hrefs against the base URL', () => {
    expect(normalizeInternalLinks(['/about', 'contact'], BASE)).toEqual([
      'https://client.example/about',
      'https://client.example/contact',
    ]);
  });

  it('keeps same-origin absolute links', () => {
    expect(normalizeInternalLinks(['https://client.example/pricing'], BASE)).toEqual([
      'https://client.example/pricing',
    ]);
  });

  it('drops cross-origin links, including subdomains', () => {
    expect(
      normalizeInternalLinks(
        ['https://blog.client.example/post', 'https://other-site.example/'],
        BASE,
      ),
    ).toEqual([]);
  });

  it('drops links on a different port', () => {
    expect(normalizeInternalLinks(['https://client.example:8080/admin'], BASE)).toEqual([]);
  });

  it('drops non-http(s) schemes', () => {
    expect(
      normalizeInternalLinks(
        [
          'mailto:hello@client.example',
          'tel:+33123456789',
          'javascript:void(0)',
          'data:text/plain,hi',
        ],
        BASE,
      ),
    ).toEqual([]);
  });

  it('strips hash fragments', () => {
    expect(normalizeInternalLinks(['/about#team'], BASE)).toEqual(['https://client.example/about']);
  });

  it('dedupes, including links that only differ by hash', () => {
    expect(normalizeInternalLinks(['/about', '/about#team', '/about'], BASE)).toEqual([
      'https://client.example/about',
    ]);
  });

  it('skips null and unparsable hrefs', () => {
    expect(normalizeInternalLinks([null, 'http://[invalid', '/valid'], BASE)).toEqual([
      'https://client.example/valid',
    ]);
  });

  it('drops links to non-HTML resources by extension', () => {
    expect(
      normalizeInternalLinks(
        [
          '/wp-content/uploads/2024/01/photo.jpg',
          '/downloads/brochure.PDF',
          '/assets/logo.svg',
          '/about',
        ],
        BASE,
      ),
    ).toEqual(['https://client.example/about']);
  });

  it('drops links matching a manual exclusion glob, before dedupe or extension filtering', () => {
    expect(
      normalizeInternalLinks(['/blog/post-1', '/blog/post-2', '/about'], BASE, [
        'https://client.example/blog/*',
      ]),
    ).toEqual(['https://client.example/about']);
  });

  it('with no exclusions, behaves exactly as before', () => {
    expect(normalizeInternalLinks(['/about'], BASE, [])).toEqual(['https://client.example/about']);
  });

  // item 1.3 (La Corniche pass) originally DROPPED these: a 20-page crawl
  // spent five slots on /, /en/, /es/, /it/ and /pt-pt/, inflating every
  // homepage defect's occurrence count roughly fivefold.
  //
  // Revised 2026-08-24 (Domaine Lagnonu): dropping them here severed whole
  // language subtrees on a site where /en is the only link into /en/*.
  // They are now returned, and crawl.ts records them
  // 'discovered-not-scanned' so they are crawled for links but never
  // scanned - which keeps La Corniche's duplicate findings away without
  // costing Lagnonu 22 pages.
  it('returns a bare root-level language-code homepage variant so its subtree stays reachable', () => {
    expect(normalizeInternalLinks(['/en/', '/es', '/it/', '/about'], BASE)).toEqual([
      'https://client.example/en',
      'https://client.example/es',
      'https://client.example/it',
      'https://client.example/about',
    ]);
  });

  it('returns a bare root-level language-region homepage variant (e.g. pt-pt)', () => {
    expect(normalizeInternalLinks(['/pt-pt/', '/en-us', '/about'], BASE)).toEqual([
      'https://client.example/pt-pt',
      'https://client.example/en-us',
      'https://client.example/about',
    ]);
  });

  it('identifies exactly the bare language homepages as discover-only', () => {
    expect(isLanguageHomepagePath('/en')).toBe(true);
    expect(isLanguageHomepagePath('/en/')).toBe(true);
    expect(isLanguageHomepagePath('/pt-pt/')).toBe(true);
    // Genuine content, never discover-only.
    expect(isLanguageHomepagePath('/en/rooms')).toBe(false);
    expect(isLanguageHomepagePath('/blog/en')).toBe(false);
    expect(isLanguageHomepagePath('/')).toBe(false);
  });

  it('does not drop a genuine content page nested under a language prefix', () => {
    expect(normalizeInternalLinks(['/en/rooms', '/en/rooms/'], BASE)).toEqual([
      'https://client.example/en/rooms',
    ]);
  });

  it('does not drop a two-letter path segment that is not at the root (not a homepage variant)', () => {
    expect(normalizeInternalLinks(['/blog/en'], BASE)).toEqual(['https://client.example/blog/en']);
  });

  it('treats a trailing slash as the same page as no trailing slash', () => {
    expect(normalizeInternalLinks(['/formulaire-rgpd', '/formulaire-rgpd/'], BASE)).toEqual([
      'https://client.example/formulaire-rgpd',
    ]);
  });

  it('does not strip the root path itself down to an empty pathname', () => {
    expect(normalizeInternalLinks(['/'], BASE)).toEqual(['https://client.example/']);
  });

  // A press page linked `href="communication@hotel.fr"` without mailto:.
  it('drops an email address written as a link path', () => {
    expect(
      normalizeInternalLinks(
        ['communication@hotel.fr', '/it/contact%40hotel.fr/', '/presse'],
        'https://client.example/it/sala-stampa',
      ),
    ).toEqual(['https://client.example/presse']);
    expect(normalizeInternalLinks(['/@hotel', '/chambres@2x'], BASE)).toEqual([
      'https://client.example/@hotel',
      'https://client.example/chambres@2x',
    ]);
  });
});

describe('globToRegExp', () => {
  it('matches a leading wildcard', () => {
    expect(globToRegExp('*.pdf').test('https://client.example/file.pdf')).toBe(true);
    expect(globToRegExp('*.pdf').test('https://client.example/file.docx')).toBe(false);
  });

  it('escapes regex metacharacters literally', () => {
    expect(globToRegExp('https://client.example/a+b').test('https://client.example/a+b')).toBe(
      true,
    );
    expect(globToRegExp('https://client.example/a+b').test('https://client.example/aXb')).toBe(
      false,
    );
  });

  it('anchors the pattern over the whole string', () => {
    expect(globToRegExp('/blog').test('/blog/post-1')).toBe(false);
    expect(globToRegExp('/blog*').test('/blog/post-1')).toBe(true);
  });
});

describe('normalizePageUrl for sitemap coverage', () => {
  it('accepts the exact hostname and its www counterpart', () => {
    expect(
      normalizePageUrl('https://www.client.example/page/', 'https://client.example/', {
        allowWwwApex: true,
      }),
    ).toBe('https://www.client.example/page');
  });

  it('normalizes an HTTP sitemap entry to the HTTPS site identity', () => {
    expect(
      normalizePageUrl('http://client.example/room', 'https://client.example/', {
        allowWwwApex: true,
      }),
    ).toBe('https://client.example/room');
  });

  it('rejects other subdomains and registrable domains', () => {
    expect(
      normalizePageUrl('https://shop.client.example/page', 'https://client.example/', {
        allowWwwApex: true,
      }),
    ).toBeUndefined();
    expect(
      normalizePageUrl('https://other.example/page', 'https://client.example/', {
        allowWwwApex: true,
      }),
    ).toBeUndefined();
  });

  it('applies exclusions and non-HTML filtering to sitemap page URLs', () => {
    expect(
      normalizePageUrl('https://client.example/private/page', 'https://client.example/', {
        allowWwwApex: true,
        exclusionPatterns: ['https://client.example/private/*'],
      }),
    ).toBeUndefined();
    expect(
      normalizePageUrl('https://client.example/brochure.pdf', 'https://client.example/', {
        allowWwwApex: true,
      }),
    ).toBeUndefined();
  });
});

/**
 * B3 (2026-08-24 three-site review): verbatim from a real haaitza.com
 * crawl, which spent eight slots on Popup Maker theme objects and then
 * printed three of them to the client as example pages.
 */
describe('B3: non-public WordPress objects', () => {
  it('drops a popup_theme query URL', () => {
    expect(
      normalizeInternalLinks(['/?post_type=popup_theme&p=1317'], 'https://haaitza.com/'),
    ).toEqual([]);
  });

  it('drops the other confirmed internal post types', () => {
    const hrefs = ['/?post_type=wp_block', '/?post_type=nav_menu_item&p=2', '/?post_type=revision'];
    expect(normalizeInternalLinks(hrefs, 'https://haaitza.com/')).toEqual([]);
  });

  it('keeps an ordinary query URL, which is a real navigable page', () => {
    expect(normalizeInternalLinks(['/blog?page=2'], 'https://haaitza.com/')).toEqual([
      'https://haaitza.com/blog?page=2',
    ]);
  });

  it('keeps a public custom post type', () => {
    expect(normalizeInternalLinks(['/?post_type=chambre&p=12'], 'https://haaitza.com/')).toEqual([
      'https://haaitza.com/?post_type=chambre&p=12',
    ]);
  });
});

describe('E9: non-public plugin objects', () => {
  it('classifies a sitemap-only rl_gallery object with structural evidence', () => {
    expect(
      classifyNonPublicPluginObject({
        discoveryMethod: 'sitemap-only',
        bodyClassTokens: ['single-rl_gallery', 'type-rl_gallery'],
      }),
    ).toEqual({ postType: 'rl_gallery', bodyClass: 'single-rl_gallery' });
  });

  it('classifies theme template and form objects by their single-<type> class', () => {
    for (const postType of ['uicore-tb', 'uicore-cd', 'metform-form']) {
      expect(
        classifyNonPublicPluginObject({
          discoveryMethod: 'sitemap-only',
          bodyClassTokens: [
            'wp-singular',
            `${postType}-template-default`,
            'single',
            `single-${postType}`,
          ],
        }),
        postType,
      ).toEqual({ postType, bodyClass: `${postType}-template-default` });
    }
    // The same theme's ordinary pages carry other uicore classes.
    expect(
      classifyNonPublicPluginObject({
        discoveryMethod: 'sitemap-only',
        bodyClassTokens: ['page-template-default', 'uicore-sticky-tb', 'uicore-animate-fade'],
      }),
    ).toBeUndefined();
  });

  it('classifies a theme slideshow object, single or archive', () => {
    expect(
      classifyNonPublicPluginObject({
        discoveryMethod: 'sitemap-only',
        bodyClassTokens: ['wp-singular', 'single', 'single-dt_slideshow'],
      }),
    ).toEqual({ postType: 'dt_slideshow', bodyClass: 'single-dt_slideshow' });
    expect(
      classifyNonPublicPluginObject({
        discoveryMethod: 'sitemap-only',
        bodyClassTokens: ['archive', 'post-type-archive', 'post-type-archive-dt_slideshow'],
      }),
    ).toEqual({ postType: 'dt_slideshow', bodyClass: 'post-type-archive-dt_slideshow' });
    // The homepage that shows the carousel says so in another class.
    expect(
      classifyNonPublicPluginObject({
        discoveryMethod: 'sitemap-only',
        bodyClassTokens: ['home', 'page', 'slideshow-on'],
      }),
    ).toBeUndefined();
  });

  it('does not classify a linked or differently shaped public page', () => {
    expect(
      classifyNonPublicPluginObject({
        discoveryMethod: 'link',
        discoveredFrom: 'https://example.com/',
        bodyClassTokens: ['single-rl_gallery'],
      }),
    ).toBeUndefined();
    expect(
      classifyNonPublicPluginObject({
        discoveryMethod: 'sitemap-only',
        bodyClassTokens: ['single-gallery'],
      }),
    ).toBeUndefined();
  });
});

/**
 * Issue #102: the page-identity half of normalizePageUrl, applied by the
 * crawl to its own start URL and to operator seeds. Discovered links and
 * sitemap entries already get the same rule through normalizePageUrl, so
 * these two doors were the only ones left where a trailing-slash spelling
 * could be enqueued as a second, distinct page.
 */
describe('normalizePageIdentityUrl (issue #102)', () => {
  it('collapses a trailing-slash spelling onto the bare form', () => {
    expect(normalizePageIdentityUrl('https://www.briketenia.com/fr/')).toBe(
      'https://www.briketenia.com/fr',
    );
    expect(normalizePageIdentityUrl('https://www.briketenia.com/fr')).toBe(
      'https://www.briketenia.com/fr',
    );
  });

  it('preserves the bare root path, which has no shorter spelling', () => {
    expect(normalizePageIdentityUrl('https://client.example/')).toBe('https://client.example/');
  });

  it('strips a fragment, which identifies a position in the page, not a page', () => {
    expect(normalizePageIdentityUrl('https://client.example/contact#equipe')).toBe(
      'https://client.example/contact',
    );
  });

  it('keeps query strings, which can be genuinely distinct pages', () => {
    expect(normalizePageIdentityUrl('https://client.example/blog?page=2')).toBe(
      'https://client.example/blog?page=2',
    );
    expect(normalizePageIdentityUrl('https://client.example/blog/?page=2')).toBe(
      'https://client.example/blog?page=2',
    );
  });

  it('returns undefined for an unparsable URL instead of throwing', () => {
    expect(normalizePageIdentityUrl('not a url')).toBeUndefined();
  });
});

describe('slashed spellings', () => {
  it('reads a trailing slash on any path but the root', () => {
    expect(isWrittenWithTrailingSlash('https://hotel.example/chambres/')).toBe(true);
    expect(isWrittenWithTrailingSlash('https://hotel.example/chambres')).toBe(false);
    expect(isWrittenWithTrailingSlash('https://hotel.example/')).toBe(false);
  });

  it('gives the slashed spelling of an identity, keeping its query', () => {
    expect(slashedSpelling('https://hotel.example/chambres?lang=fr')).toBe(
      'https://hotel.example/chambres/?lang=fr',
    );
    expect(slashedSpelling('https://hotel.example/')).toBeUndefined();
  });
});

// Plan 075 M3: yonahotel.com linked its own pages with analytics tags.
describe('normalizePageUrl tracking parameters', () => {
  const base = 'https://www.yonahotel.com/fr';

  it('drops campaign and click identifiers', () => {
    expect(
      normalizePageUrl(
        '/fr/yuzu-spa-restaurant-obernai?_gl=1*90m0or*_up*MQ..&gclid=Cj0KCQjw&gbraid=0AAAAACm',
        base,
      ),
    ).toBe('https://www.yonahotel.com/fr/yuzu-spa-restaurant-obernai');
    expect(normalizePageUrl('/fr/spa?utm_source=site&utm_medium=popin', base)).toBe(
      'https://www.yonahotel.com/fr/spa',
    );
  });

  it('keeps a parameter that may select content', () => {
    expect(normalizePageUrl('/fr/booking/room?info[room_id]=102258&fbclid=x', base)).toBe(
      'https://www.yonahotel.com/fr/booking/room?info%5Broom_id%5D=102258',
    );
    expect(normalizePageUrl('/fra/promotions/viewReservitRate?rate_id=170830', base)).toBe(
      'https://www.yonahotel.com/fra/promotions/viewReservitRate?rate_id=170830',
    );
  });
});
