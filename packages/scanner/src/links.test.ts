import { describe, expect, it } from 'vitest';
import { normalizeInternalLinks } from './links.js';

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
});
