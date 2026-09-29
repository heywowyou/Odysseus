import { describe, expect, it } from 'vitest';
import { ContinuationGuard } from './continuation-guard.js';
import { InventoryLedger } from './inventory-ledger.js';
import {
  decideLinkAdmission,
  MAX_SURFACE_LINKS_PER_REFERRER,
  OPERATOR_EXCLUSION_REFUSAL,
  recordLinkRefusal,
  resolvePageLinks,
  type PageAnchor,
  type PageLink,
  type RelativeLinkNestingSummary,
} from './link-admission.js';

const anchor = (href: string | null, extra: Partial<PageAnchor> = {}): PageAnchor => ({
  href,
  relNext: false,
  isNumberedPaginationControl: false,
  ...extra,
});

const emptySummary = (): RelativeLinkNestingSummary => ({
  omittedUrlCount: 0,
  omittedExampleUrls: [],
  repeatedSegments: [],
});

describe('resolvePageLinks (issue #566)', () => {
  it('resolves a relative href against <base href>, not the page URL', () => {
    const { links } = resolvePageLinks([anchor('en/rooms.html')], {
      documentBase: 'https://hotel.example/',
      landedUrl: 'https://hotel.example/en/webcam.html',
      exclusions: [],
    });
    expect(links.map((link) => link.url)).toEqual(['https://hotel.example/en/rooms.html']);
    expect(links[0]?.nesting).toBeUndefined();
  });

  it('marks a relative href that repeats its own directory', () => {
    const { links } = resolvePageLinks([anchor('en/rooms.html'), anchor('spa.html')], {
      documentBase: 'https://hotel.example/en/video.html',
      landedUrl: 'https://hotel.example/en/video.html',
      exclusions: [],
    });
    expect(links.map((link) => [link.url, link.nesting?.repeatedSegment])).toEqual([
      ['https://hotel.example/en/en/rooms.html', 'en'],
      ['https://hotel.example/en/spa.html', undefined],
    ]);
  });

  it('keeps operator-excluded links apart, with the href as written', () => {
    const resolved = resolvePageLinks([anchor('/wp-admin/'), anchor('/chambres')], {
      documentBase: 'https://hotel.example/',
      landedUrl: 'https://hotel.example/',
      exclusions: ['*/wp-admin*'],
    });
    expect(resolved.links.map((link) => link.url)).toEqual(['https://hotel.example/chambres']);
    expect(resolved.excluded).toEqual([
      { url: 'https://hotel.example/wp-admin', observedHref: '/wp-admin/' },
    ]);
  });

  it('drops off-site and non-HTML links, and merges the evidence of two anchors to one page', () => {
    const { links } = resolvePageLinks(
      [
        anchor('https://booking.example/x'),
        anchor('/menu.pdf'),
        anchor('/page/2/'),
        anchor('/page/2', { relNext: true }),
        anchor(null),
      ],
      {
        documentBase: 'https://hotel.example/',
        landedUrl: 'https://hotel.example/',
        exclusions: [],
      },
    );
    expect(links).toEqual([
      {
        url: 'https://hotel.example/page/2',
        observedHref: '/page/2/',
        relNext: true,
        isNumberedPaginationControl: false,
      },
    ]);
  });
});

describe('decideLinkAdmission (issue #566)', () => {
  const link = (url: string, extra: Partial<PageLink> = {}): PageLink => ({
    url,
    observedHref: url,
    relNext: false,
    isNumberedPaginationControl: false,
    ...extra,
  });
  const base = { isKnown: false, referrerDepth: 1, maxDepth: 3 };

  it('admits an ordinary link and leaves a known one alone', () => {
    expect(decideLinkAdmission(link('https://hotel.example/a'), base)).toEqual({ kind: 'admit' });
    expect(
      decideLinkAdmission(link('https://hotel.example/a'), { ...base, isKnown: true }),
    ).toEqual({ kind: 'known' });
  });

  it('refuses past the depth bound before anything else', () => {
    const nested = link('https://hotel.example/en/en/a', {
      nesting: {
        sourceUrl: 'https://hotel.example/en/b',
        href: 'en/a',
        resolvedUrl: 'https://hotel.example/en/en/a',
        repeatedSegment: 'en',
      },
    });
    expect(decideLinkAdmission(nested, { ...base, referrerDepth: 3 })).toMatchObject({
      kind: 'refused',
      disposition: 'depth-bound',
    });
    expect(decideLinkAdmission(nested, base)).toMatchObject({
      kind: 'refused',
      disposition: 'relative-link-nesting',
    });
  });

  it('applies the continuation guard only when the entry brings one', () => {
    const guard = new ContinuationGuard(1);
    const continuation = {
      guard,
      sourcePageUrl: 'https://hotel.example/blog',
      sourceIsConfirmedListing: false,
      repeatedQueryKeysOnSourcePage: new Set<string>(),
    };
    const page = (n: number) => link(`https://hotel.example/page/${n}`, { relNext: true });
    expect(decideLinkAdmission(page(2), { ...base, continuation })).toEqual({ kind: 'admit' });
    expect(decideLinkAdmission(page(3), { ...base, continuation })).toMatchObject({
      kind: 'refused',
      disposition: 'continuation-guard',
    });
    expect(decideLinkAdmission(page(3), base)).toEqual({ kind: 'admit' });
  });

  it('files the waves own bounds under their own dispositions', () => {
    expect(
      decideLinkAdmission(link('https://hotel.example/a'), {
        ...base,
        pageBudgetSpent: { maxPages: 10 },
      }),
    ).toMatchObject({ kind: 'refused', disposition: 'page-cap' });
    expect(
      decideLinkAdmission(link('https://hotel.example/a'), {
        ...base,
        referrerAdmittedCount: {
          referrer: 'https://hotel.example/',
          count: MAX_SURFACE_LINKS_PER_REFERRER,
        },
      }),
    ).toMatchObject({ kind: 'refused', disposition: 'surface-link-bound' });
  });
});

describe('the crawl and a surface refuse the same anchors the same way (issue #566)', () => {
  const pageUrl = 'https://hotel.example/en/video.html';
  const anchors = [anchor('en/rooms.html'), anchor('spa.html'), anchor('/wp-admin/')];
  const exclusions = ['*/wp-admin*'];

  function dispositions(entry: 'crawl' | 'surface'): Record<string, string | undefined> {
    const ledger = new InventoryLedger({
      evidenceEpoch: 1,
      scopeDigest: `sha256:${'a'.repeat(64)}`,
    });
    const summary = emptySummary();
    const resolved = resolvePageLinks(anchors, {
      documentBase: pageUrl,
      landedUrl: pageUrl,
      exclusions,
    });
    const discover = (url: string): void => {
      ledger.recordDiscovery({
        url,
        source: entry === 'crawl' ? 'link' : 'rendered-link',
        discoveredAt: new Date(),
        referrer: pageUrl,
        depth: 2,
      });
    };
    for (const excluded of resolved.excluded) {
      discover(excluded.url);
      recordLinkRefusal(ledger, summary, excluded, OPERATOR_EXCLUSION_REFUSAL);
    }
    for (const link of resolved.links) {
      discover(link.url);
      const admission = decideLinkAdmission(link, {
        isKnown: false,
        referrerDepth: 1,
        maxDepth: 5,
        ...(entry === 'crawl'
          ? {
              continuation: {
                guard: new ContinuationGuard(),
                sourcePageUrl: pageUrl,
                sourceIsConfirmedListing: false,
                repeatedQueryKeysOnSourcePage: new Set<string>(),
              },
            }
          : { referrerAdmittedCount: { referrer: pageUrl, count: 0 } }),
      });
      if (admission.kind === 'refused') recordLinkRefusal(ledger, summary, link, admission);
    }
    expect(summary.omittedUrlCount).toBe(1);
    return Object.fromEntries(
      ledger.candidates().map((candidate) => [candidate.url, candidate.disposition?.disposition]),
    );
  }

  it('records the same dispositions', () => {
    expect(dispositions('surface')).toEqual(dispositions('crawl'));
    expect(dispositions('crawl')).toEqual({
      'https://hotel.example/wp-admin': 'operator-excluded',
      'https://hotel.example/en/en/rooms.html': 'relative-link-nesting',
      'https://hotel.example/en/spa.html': undefined,
    });
  });
});
