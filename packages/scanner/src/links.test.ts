import { describe, expect, it } from 'vitest';
import { globToRegExp, isLanguageHomepagePath, normalizeInternalLinks } from './links.js';

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
        ['mailto:hello@client.example', 'tel:+33123456789', 'javascript:void(0)', 'data:text/plain,hi'],
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
      normalizeInternalLinks(['/blog/post-1', '/blog/post-2', '/about'], BASE, ['https://client.example/blog/*']),
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
});

describe('globToRegExp', () => {
  it('matches a leading wildcard', () => {
    expect(globToRegExp('*.pdf').test('https://client.example/file.pdf')).toBe(true);
    expect(globToRegExp('*.pdf').test('https://client.example/file.docx')).toBe(false);
  });

  it('escapes regex metacharacters literally', () => {
    expect(globToRegExp('https://client.example/a+b').test('https://client.example/a+b')).toBe(true);
    expect(globToRegExp('https://client.example/a+b').test('https://client.example/aXb')).toBe(false);
  });

  it('anchors the pattern over the whole string', () => {
    expect(globToRegExp('/blog').test('/blog/post-1')).toBe(false);
    expect(globToRegExp('/blog*').test('/blog/post-1')).toBe(true);
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
