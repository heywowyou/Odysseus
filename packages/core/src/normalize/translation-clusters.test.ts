import { describe, expect, it } from 'vitest';
import {
  buildCanonicalPageUrlMap,
  buildTranslationClusters,
  canonicalizeUrlForMatching,
  type TranslationClusterInput,
} from './translation-clusters.js';

/** Verbatim shape of the real Haaitza gallery page's hreflang block. */
const HAAITZA_GALLERY: TranslationClusterInput[] = [
  {
    pageUrl: 'https://haaitza.com/galerie-hotel-de-luxe-pyla',
    hreflangLinks: [
      { lang: 'fr', href: 'https://haaitza.com/galerie-hotel-de-luxe-pyla/' },
      { lang: 'en', href: 'https://haaitza.com/en/photo-gallery-hotels-spa-gironde/' },
      { lang: 'it', href: 'https://haaitza.com/it/la-galleria/' },
      { lang: 'pt-pt', href: 'https://haaitza.com/pt-pt/a-galeria/' },
      { lang: 'es', href: 'https://haaitza.com/es/galera/' },
      { lang: 'x-default', href: 'https://haaitza.com/galerie-hotel-de-luxe-pyla/' },
    ],
  },
  { pageUrl: 'https://haaitza.com/en/photo-gallery-hotels-spa-gironde', hreflangLinks: [] },
  { pageUrl: 'https://haaitza.com/it/la-galleria', hreflangLinks: [] },
  { pageUrl: 'https://haaitza.com/pt-pt/a-galeria', hreflangLinks: [] },
  { pageUrl: 'https://haaitza.com/es/galera', hreflangLinks: [] },
];

describe('canonicalizeUrlForMatching', () => {
  it('ignores a trailing slash, a fragment and host case', () => {
    expect(canonicalizeUrlForMatching('https://Haaitza.com/a/#top')).toBe('https://haaitza.com/a');
  });

  it('keeps a query string, since it is a genuinely different page', () => {
    expect(canonicalizeUrlForMatching('https://haaitza.com/?post_type=popup_theme&p=1')).toBe(
      'https://haaitza.com/?post_type=popup_theme&p=1',
    );
  });

  it('leaves the root path alone', () => {
    expect(canonicalizeUrlForMatching('https://haaitza.com/')).toBe('https://haaitza.com/');
  });
});

describe('buildTranslationClusters', () => {
  it('groups the five real Haaitza gallery variants into one cluster', () => {
    const clusters = buildTranslationClusters(HAAITZA_GALLERY);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.members).toHaveLength(5);
  });

  it('picks the x-default target as the canonical member', () => {
    const clusters = buildTranslationClusters(HAAITZA_GALLERY);
    expect(clusters[0]!.canonicalPageUrl).toBe('https://haaitza.com/galerie-hotel-de-luxe-pyla');
  });

  it('records each member language from the declaration', () => {
    const [cluster] = buildTranslationClusters(HAAITZA_GALLERY);
    const langs = Object.fromEntries(cluster!.members.map((m) => [m.pageUrl, m.lang]));
    expect(langs['https://haaitza.com/es/galera']).toBe('es');
    expect(langs['https://haaitza.com/pt-pt/a-galeria']).toBe('pt-pt');
  });

  it('never invents a cluster from a URL prefix alone', () => {
    const clusters = buildTranslationClusters([
      { pageUrl: 'https://x.com/chambres', hreflangLinks: [] },
      { pageUrl: 'https://x.com/en/rooms', hreflangLinks: [] },
    ]);
    expect(clusters).toHaveLength(2);
  });

  it('ignores an alternate pointing outside the crawled set', () => {
    const clusters = buildTranslationClusters([
      {
        pageUrl: 'https://x.com/a',
        hreflangLinks: [{ lang: 'de', href: 'https://x.com/de/a' }],
      },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.members).toHaveLength(1);
  });

  // Gate 1. A first implementation unioned transitively on any shared
  // hreflang target; against the real La Corniche scan that produced one
  // 55-member "cluster" holding ten genuinely different room pages,
  // because every room page copies the rooms *listing* page's hreflang
  // block verbatim and so declares that its own English version is a
  // different URL. Verbatim from that scan.
  it('refuses to cluster a page whose declared set does not include itself', () => {
    const listingBlock = [
      { lang: 'fr', href: 'https://lacoorniche.com/les-chambres-et-suites-dune-du-pyla-hotel/' },
      { lang: 'en', href: 'https://lacoorniche.com/en/rooms-suites-hotel-pyla/' },
      { lang: 'es', href: 'https://lacoorniche.com/es/les-chambres-et-suites-dune-du-pyla-hotel/' },
      {
        lang: 'x-default',
        href: 'https://lacoorniche.com/les-chambres-et-suites-dune-du-pyla-hotel/',
      },
    ];
    const clusters = buildTranslationClusters([
      {
        pageUrl: 'https://lacoorniche.com/les-chambres-et-suites-dune-du-pyla-hotel',
        hreflangLinks: listingBlock,
      },
      {
        pageUrl: 'https://lacoorniche.com/en/rooms-suites-hotel-pyla',
        hreflangLinks: listingBlock,
      },
      {
        pageUrl: 'https://lacoorniche.com/es/les-chambres-et-suites-dune-du-pyla-hotel',
        hreflangLinks: listingBlock,
      },
      { pageUrl: 'https://lacoorniche.com/en/room/banc-darguin', hreflangLinks: listingBlock },
      { pageUrl: 'https://lacoorniche.com/en/room/dune', hreflangLinks: listingBlock },
    ]);
    const sizes = clusters.map((c) => c.members.length).sort((a, b) => b - a);
    expect(sizes).toEqual([3, 1, 1]);
    const rooms = clusters.filter((c) => c.canonicalPageUrl.includes('/room/'));
    expect(rooms.map((c) => c.members.length)).toEqual([1, 1]);
  });

  it('rejects a set claiming two different URLs for the same language', () => {
    const clusters = buildTranslationClusters([
      {
        pageUrl: 'https://x.com/a',
        hreflangLinks: [
          { lang: 'fr', href: 'https://x.com/a' },
          { lang: 'en', href: 'https://x.com/en/a' },
          { lang: 'en', href: 'https://x.com/en/b' },
        ],
      },
      { pageUrl: 'https://x.com/en/a', hreflangLinks: [] },
      { pageUrl: 'https://x.com/en/b', hreflangLinks: [] },
    ]);
    expect(clusters.map((c) => c.members.length)).toEqual([1, 1, 1]);
  });

  it('absorbs a member that declares nothing itself, when a valid set names it', () => {
    const block = [
      { lang: 'fr', href: 'https://x.com/a' },
      { lang: 'en', href: 'https://x.com/en/a' },
    ];
    const clusters = buildTranslationClusters([
      { pageUrl: 'https://x.com/a', hreflangLinks: block },
      { pageUrl: 'https://x.com/en/a', hreflangLinks: [] },
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.members).toHaveLength(2);
  });

  it('is stable across input ordering', () => {
    const forward = buildTranslationClusters(HAAITZA_GALLERY);
    const reversed = buildTranslationClusters([...HAAITZA_GALLERY].reverse());
    expect(reversed).toEqual(forward);
  });
});

describe('buildCanonicalPageUrlMap', () => {
  it('maps every variant onto the canonical page', () => {
    const map = buildCanonicalPageUrlMap(buildTranslationClusters(HAAITZA_GALLERY));
    expect(map.get('https://haaitza.com/es/galera')).toBe(
      'https://haaitza.com/galerie-hotel-de-luxe-pyla',
    );
    expect(map.get('https://haaitza.com/galerie-hotel-de-luxe-pyla')).toBe(
      'https://haaitza.com/galerie-hotel-de-luxe-pyla',
    );
  });
});
