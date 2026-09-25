import { describe, expect, it } from 'vitest';
import {
  checkAiCrawlerAccess,
  findBlockingPattern,
  isAllowedByRobots,
  normalizeRobotsPath,
  parseRobotsTxt,
  robotsProductToken,
} from './robots.js';

describe('robotsProductToken', () => {
  it('keeps the part before the version and lower-cases it', () => {
    expect(robotsProductToken('OdysseusBot/1.0 (+https://odysseusaudit.com/bot)')).toBe(
      'odysseusbot',
    );
  });

  it('leaves a bare token unchanged apart from case', () => {
    expect(robotsProductToken('GPTBot')).toBe('gptbot');
  });
});

describe('parseRobotsTxt', () => {
  it('returns allow-all when the text has no matching group', () => {
    const rules = parseRobotsTxt('User-agent: SomeOtherBot\nDisallow: /\n', 'OdysseusAuditBot');
    expect(rules).toEqual({ found: true, disallow: [], allow: [], sitemapUrls: [] });
  });

  it('returns allow-all for empty text', () => {
    expect(parseRobotsTxt('', 'OdysseusAuditBot')).toEqual({
      found: true,
      disallow: [],
      allow: [],
      sitemapUrls: [],
    });
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

  it('matches a group by the product token of a full user-agent header', () => {
    const rules = parseRobotsTxt(
      'User-agent: OdysseusBot\nDisallow: /\n',
      'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)',
    );
    expect(rules.disallow).toEqual(['/']);
  });

  it('honours a group written for the legacy OdysseusAuditBot token', () => {
    const rules = parseRobotsTxt(
      'User-agent: odysseusauditbot\nDisallow: /\n',
      'OdysseusAuditBot/0.1 (+https://odysseusaudit.com/bot)',
    );
    expect(rules.disallow).toEqual(['/']);
    expect(
      parseRobotsTxt(
        'User-agent: OdysseusAuditBot\nDisallow: /legacy\n',
        'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)',
      ).disallow,
    ).toEqual(['/legacy']);
  });

  it('uses only the bot-specific group when a wildcard group also exists', () => {
    const text = 'User-agent: *\nDisallow: /admin\n\nUser-agent: OdysseusBot\nDisallow: /private\n';
    const rules = parseRobotsTxt(text, 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)');
    expect(rules.disallow).toEqual(['/private']);
  });

  it('merges every group that names the bot', () => {
    const text = [
      'User-agent: OdysseusBot',
      'Disallow: /a',
      'Crawl-delay: 1',
      '',
      'User-agent: Other',
      'Disallow: /other',
      '',
      'User-agent: OdysseusBot',
      'Disallow: /b',
      'Allow: /b/open',
      'Crawl-delay: 3',
    ].join('\n');
    const rules = parseRobotsTxt(text, 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)');
    expect(rules.disallow).toEqual(['/a', '/b']);
    expect(rules.allow).toEqual(['/b/open']);
    expect(rules.crawlDelayMs).toBe(3000);
  });

  it('starts a new group after an empty Disallow directive', () => {
    const text = 'User-agent: *\nDisallow:\n\nUser-agent: SemrushBot\nDisallow: /\n';
    expect(parseRobotsTxt(text, 'OdysseusBot').disallow).toEqual([]);
    expect(parseRobotsTxt(text, 'SemrushBot').disallow).toEqual(['/']);
  });

  it('starts a new group after an empty Allow directive', () => {
    const text = 'User-agent: *\nAllow:\n\nUser-agent: SemrushBot\nDisallow: /\n';
    expect(parseRobotsTxt(text, 'OdysseusBot').disallow).toEqual([]);
    expect(parseRobotsTxt(text, 'SemrushBot').disallow).toEqual(['/']);
  });

  it('strips a UTF-8 BOM before the first field name', () => {
    expect(
      parseRobotsTxt('\uFEFFUser-agent: *\nDisallow: /private\n', 'OdysseusBot').disallow,
    ).toEqual(['/private']);
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
    expect(parseRobotsTxt(text, 'OdysseusAuditBot').sitemapUrls).toEqual([
      'https://example.com/sitemap.xml',
    ]);
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
    expect(
      isAllowedByRobots({ found: true, disallow: [], allow: [], sitemapUrls: [] }, '/anything'),
    ).toBe(true);
  });

  it('disallows a matching prefix', () => {
    const rules = { found: true, disallow: ['/private'], allow: [], sitemapUrls: [] };
    expect(isAllowedByRobots(rules, '/private')).toBe(false);
    expect(isAllowedByRobots(rules, '/private/nested')).toBe(false);
    expect(isAllowedByRobots(rules, '/public')).toBe(true);
  });

  it('lets a longer Allow override a broader Disallow', () => {
    const rules = {
      found: true,
      disallow: ['/private'],
      allow: ['/private/public-notice'],
      sitemapUrls: [],
    };
    expect(isAllowedByRobots(rules, '/private/public-notice')).toBe(true);
    expect(isAllowedByRobots(rules, '/private/secret')).toBe(false);
  });

  it('resolves an equal-length tie in favor of allow', () => {
    const rules = { found: true, disallow: ['/x'], allow: ['/x'], sitemapUrls: [] };
    expect(isAllowedByRobots(rules, '/x')).toBe(true);
  });

  it('supports a wildcard pattern', () => {
    const rules = { found: true, disallow: ['/search*'], allow: [], sitemapUrls: [] };
    expect(isAllowedByRobots(rules, '/search?q=wine')).toBe(false);
    expect(isAllowedByRobots(rules, '/searching')).toBe(false);
    expect(isAllowedByRobots(rules, '/other')).toBe(true);
  });

  it('supports an end-anchored pattern', () => {
    const rules = { found: true, disallow: ['/*.pdf$'], allow: [], sitemapUrls: [] };
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
    const rules = {
      found: true,
      disallow: ['/private'],
      allow: ['/private/public-notice'],
      sitemapUrls: [],
    };
    expect(findBlockingPattern(rules, '/private/public-notice')).toBeUndefined();
  });

  it('returns the more specific of two matching Disallow patterns', () => {
    const rules = { found: true, disallow: ['/blog', '/blog/drafts'], allow: [], sitemapUrls: [] };
    expect(findBlockingPattern(rules, '/blog/drafts/2026')).toBe('/blog/drafts');
  });
});

describe('checkAiCrawlerAccess', () => {
  it('reports every agent as allowed when there is no robots.txt at all', () => {
    const results = checkAiCrawlerAccess(null, ['GPTBot', 'ClaudeBot']);
    expect(results).toEqual([
      { agent: 'GPTBot', blocked: false },
      { agent: 'ClaudeBot', blocked: false },
    ]);
  });

  it('flags a named agent blocked at the site root', () => {
    const text = 'User-agent: GPTBot\nDisallow: /\n';
    const results = checkAiCrawlerAccess(text, ['GPTBot', 'ClaudeBot']);
    expect(results).toEqual([
      { agent: 'GPTBot', blocked: true, disallowPattern: '/' },
      { agent: 'ClaudeBot', blocked: false },
    ]);
  });

  it('does not flag an agent only blocked from an unrelated path', () => {
    const text = 'User-agent: GPTBot\nDisallow: /admin\n';
    const results = checkAiCrawlerAccess(text, ['GPTBot']);
    expect(results).toEqual([{ agent: 'GPTBot', blocked: false }]);
  });

  it('falls back to the wildcard group for an agent with no named group', () => {
    const text = 'User-agent: *\nDisallow: /\n';
    const results = checkAiCrawlerAccess(text, ['PerplexityBot']);
    expect(results).toEqual([{ agent: 'PerplexityBot', blocked: true, disallowPattern: '/' }]);
  });
});

describe('percent-encoded matching (issue #492)', () => {
  const rules = (disallow: string[], allow: string[] = []) => ({
    found: true,
    disallow,
    allow,
    sitemapUrls: [],
  });

  it('matches a rule written with accents against the encoded path, in either hex case', () => {
    const accented = rules(['/réservation']);
    expect(findBlockingPattern(accented, '/r%C3%A9servation')).toBe('/réservation');
    expect(findBlockingPattern(accented, '/r%c3%a9servation/chambre')).toBe('/réservation');
    expect(findBlockingPattern(accented, '/reservation')).toBeUndefined();
  });

  it('matches an encoded rule against an encoded path whatever the hex case', () => {
    expect(findBlockingPattern(rules(['/r%c3%a9servation']), '/r%C3%A9servation')).toBe(
      '/r%c3%a9servation',
    );
  });

  it('decides the longest match on encoded length', () => {
    // '/é' is 2 characters as written but 7 encoded, longer than '/%C3'.
    const mixed = rules(['/%C3%A9t'], ['/été']);
    expect(findBlockingPattern(mixed, '/%C3%A9t%C3%A9')).toBeUndefined();
    expect(normalizeRobotsPath('/été')).toBe('/%C3%A9t%C3%A9');
  });

  it('collapses runs of wildcards and keeps the end anchor', () => {
    expect(findBlockingPattern(rules(['/**.pdf$']), '/docs/tarifs.pdf')).toBe('/**.pdf$');
    expect(findBlockingPattern(rules(['/**.pdf$']), '/docs/tarifs.pdf?x=1')).toBeUndefined();
  });
});
