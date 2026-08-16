import { describe, expect, it } from 'vitest';
import { findBlockingPattern, isAllowedByRobots, parseRobotsTxt } from './robots.js';

describe('parseRobotsTxt', () => {
  it('returns allow-all when the text has no matching group', () => {
    const rules = parseRobotsTxt('User-agent: SomeOtherBot\nDisallow: /\n', 'OdysseusAuditBot');
    expect(rules).toEqual({ found: true, disallow: [], allow: [] , sitemapUrls: [] });
  });

  it('returns allow-all for empty text', () => {
    expect(parseRobotsTxt('', 'OdysseusAuditBot')).toEqual({ found: true, disallow: [], allow: [] , sitemapUrls: [] });
  });

  it('prefers an exact user-agent match over the wildcard group', () => {
    const text = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: OdysseusAuditBot',
      'Disallow: /private',
    ].join('\n');
    const rules = parseRobotsTxt(text, 'OdysseusAuditBot');
    expect(rules.disallow).toEqual(['/private']);
  });

  it('falls back to the wildcard group when there is no exact match', () => {
    const text = 'User-agent: *\nDisallow: /admin\n';
    const rules = parseRobotsTxt(text, 'OdysseusAuditBot');
    expect(rules.disallow).toEqual(['/admin']);
  });

  it('treats an empty Disallow value as allow-all for that line', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow:\n', '*');
    expect(rules.disallow).toEqual([]);
  });

  it('groups consecutive User-agent lines sharing the following directives', () => {
    const text = ['User-agent: Foo', 'User-agent: *', 'Disallow: /shared'].join('\n');
    expect(parseRobotsTxt(text, 'Foo').disallow).toEqual(['/shared']);
    expect(parseRobotsTxt(text, 'Unmatched').disallow).toEqual(['/shared']);
  });

  it('parses Crawl-delay into milliseconds', () => {
    const rules = parseRobotsTxt('User-agent: *\nCrawl-delay: 2\n', '*');
    expect(rules.crawlDelayMs).toBe(2000);
  });

  it('ignores comments', () => {
    const rules = parseRobotsTxt('# a comment\nUser-agent: *\nDisallow: /x # inline note\n', '*');
    expect(rules.disallow).toEqual(['/x']);
  });

  it('collects Sitemap directives regardless of user-agent group', () => {
    const text = [
      'User-agent: *',
      'Disallow: /admin',
      'Sitemap: https://example.com/sitemap.xml',
    ].join('\n');
    expect(parseRobotsTxt(text, 'OdysseusAuditBot').sitemapUrls).toEqual(['https://example.com/sitemap.xml']);
  });

  it('collects multiple Sitemap directives', () => {
    const text = [
      'Sitemap: https://example.com/sitemap-1.xml',
      'User-agent: *',
      'Disallow: /',
      'Sitemap: https://example.com/sitemap-2.xml',
    ].join('\n');
    expect(parseRobotsTxt(text, '*').sitemapUrls).toEqual([
      'https://example.com/sitemap-1.xml',
      'https://example.com/sitemap-2.xml',
    ]);
  });

  it('returns an empty sitemapUrls array when none are declared', () => {
    expect(parseRobotsTxt('User-agent: *\nDisallow: /\n', '*').sitemapUrls).toEqual([]);
  });
});

describe('isAllowedByRobots', () => {
  it('allows everything when there are no rules', () => {
    expect(isAllowedByRobots({ found: true, disallow: [], allow: [] , sitemapUrls: [] }, '/anything')).toBe(true);
  });

  it('disallows a matching prefix', () => {
    const rules = { found: true, disallow: ['/private'], allow: [] , sitemapUrls: [] };
    expect(isAllowedByRobots(rules, '/private')).toBe(false);
    expect(isAllowedByRobots(rules, '/private/nested')).toBe(false);
    expect(isAllowedByRobots(rules, '/public')).toBe(true);
  });

  it('lets a longer Allow override a broader Disallow', () => {
    const rules = { found: true, disallow: ['/private'], allow: ['/private/public-notice'] , sitemapUrls: [] };
    expect(isAllowedByRobots(rules, '/private/public-notice')).toBe(true);
    expect(isAllowedByRobots(rules, '/private/secret')).toBe(false);
  });

  it('resolves an equal-length tie in favor of allow', () => {
    const rules = { found: true, disallow: ['/x'], allow: ['/x'] , sitemapUrls: [] };
    expect(isAllowedByRobots(rules, '/x')).toBe(true);
  });

  it('supports a wildcard pattern', () => {
    const rules = { found: true, disallow: ['/search*'], allow: [] , sitemapUrls: [] };
    expect(isAllowedByRobots(rules, '/search?q=wine')).toBe(false);
    expect(isAllowedByRobots(rules, '/searching')).toBe(false);
    expect(isAllowedByRobots(rules, '/other')).toBe(true);
  });

  it('supports an end-anchored pattern', () => {
    const rules = { found: true, disallow: ['/*.pdf$'], allow: [] , sitemapUrls: [] };
    expect(isAllowedByRobots(rules, '/brochure.pdf')).toBe(false);
    expect(isAllowedByRobots(rules, '/brochure.pdf?download=1')).toBe(true);
  });
});

describe('findBlockingPattern', () => {
  it('returns undefined when the page is allowed', () => {
    const rules = { found: true, disallow: ['/private'], allow: [], sitemapUrls: [] };
    expect(findBlockingPattern(rules, '/public')).toBeUndefined();
  });

  it('returns the winning Disallow pattern text, not just a boolean, when blocked', () => {
    const rules = { found: true, disallow: ['/private'], allow: [], sitemapUrls: [] };
    expect(findBlockingPattern(rules, '/private/nested')).toBe('/private');
  });

  it('returns undefined when a longer Allow overrides the Disallow', () => {
    const rules = { found: true, disallow: ['/private'], allow: ['/private/public-notice'], sitemapUrls: [] };
    expect(findBlockingPattern(rules, '/private/public-notice')).toBeUndefined();
  });

  it('returns the more specific of two matching Disallow patterns', () => {
    const rules = { found: true, disallow: ['/blog', '/blog/drafts'], allow: [], sitemapUrls: [] };
    expect(findBlockingPattern(rules, '/blog/drafts/2026')).toBe('/blog/drafts');
  });
});
