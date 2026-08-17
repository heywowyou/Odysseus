import { describe, expect, it } from 'vitest';
import { globToRegExp, normalizeInternalLinks } from './links.js';

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
