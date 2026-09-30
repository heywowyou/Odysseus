import { describe, expect, it } from 'vitest';
import type { ManifestPageEntry, PageAnalysisCoverage } from '../types/manifest.js';
import { markQueryVariants, type QueryVariantFacts } from './query-variants.js';

const coverage: PageAnalysisCoverage = {
  plannerVersion: 'v3',
  role: 'unknown',
  confidence: 'fallback',
  reasonCodes: [],
  passes: {
    rendered: { outcome: 'completed' },
    axe: { outcome: 'completed' },
    extended: { outcome: 'completed' },
    lighthouse: { outcome: 'not-planned' },
  },
};

const visited = (url: string): ManifestPageEntry => ({
  url,
  depth: 1,
  status: 'visited',
  discoveryMethod: 'link',
  analysisCoverage: coverage,
  errors: {},
});

const statusOf = (entries: ManifestPageEntry[], url: string) =>
  entries.find((entry) => entry.url === url);

describe('markQueryVariants (plan 075 M3)', () => {
  // coin-savoyard, 2026-09-29: dated room links declare the room page canonical.
  it('marks a query copy that declares its query-less page canonical', () => {
    const room = 'https://www.coin-savoyard.com/fr/chambre/chambre-triple-vue-sur-montagne-3';
    const dated = `${room}?info%5Barrival_date%5D=2026-10-02&info%5Bdeparture_date%5D=2026-10-03`;
    const facts: QueryVariantFacts[] = [
      { pageUrl: room, canonicalUrls: [room] },
      { pageUrl: dated, canonicalUrls: [room] },
    ];

    const marked = markQueryVariants([visited(room), visited(dated)], facts);

    expect(statusOf(marked, dated)).toMatchObject({
      status: 'query-variant',
      variantOfUrl: room,
      setAsideAnalysisCoverage: coverage,
    });
    expect(statusOf(marked, dated)?.analysisCoverage).toBeUndefined();
    expect(statusOf(marked, room)?.status).toBe('visited');
  });

  // yonahotel, 2026-09-28: menu and tracking parameters, no canonical.
  it('marks a query copy that serves the same raw document', () => {
    const page = 'https://www.yonahotel.com/fr/signature-restaurant-gastronomique-alsace-brunch';
    const menu = `${page}?menu-booking=signature`;
    const facts: QueryVariantFacts[] = [
      { pageUrl: page, canonicalUrls: [], rawTextSignature: '057f183fbc6e55d8' },
      { pageUrl: menu, canonicalUrls: [], rawTextSignature: '057f183fbc6e55d8' },
    ];

    expect(statusOf(markQueryVariants([visited(page), visited(menu)], facts), menu)?.status).toBe(
      'query-variant',
    );
  });

  it('keeps a query page whose content differs and names no canonical', () => {
    const page = 'https://www.closdesarts.com/fra/promotions/viewReservitRate';
    const rate = `${page}?rate_id=170830`;
    const facts: QueryVariantFacts[] = [
      { pageUrl: page, canonicalUrls: [], rawTextSignature: 'aaaa' },
      { pageUrl: rate, canonicalUrls: [], rawTextSignature: 'bbbb' },
    ];

    expect(statusOf(markQueryVariants([visited(page), visited(rate)], facts), rate)?.status).toBe(
      'visited',
    );
  });

  it('keeps a query page when its query-less page was not analysed', () => {
    const room = 'https://www.coin-savoyard.com/fr/booking/room';
    const withRoom = `${room}?info%5Broom_id%5D=102258`;
    const marked = markQueryVariants(
      [{ ...visited(room), status: 'soft-error-page' }, visited(withRoom)],
      [{ pageUrl: withRoom, canonicalUrls: [room] }],
    );

    expect(statusOf(marked, withRoom)?.status).toBe('visited');
  });

  it('keeps a query page whose canonical names another page', () => {
    const cookie = 'https://grandhoteldesalpes.com/fr/cookie-policy-uk';
    const lang = `${cookie}?clang=en`;
    const marked = markQueryVariants(
      [visited(cookie), visited(lang)],
      [
        { pageUrl: cookie, canonicalUrls: [] },
        { pageUrl: lang, canonicalUrls: ['https://grandhoteldesalpes.com/en/cookie-policy-uk/'] },
      ],
    );

    expect(statusOf(marked, lang)?.status).toBe('visited');
  });

  // clos-sainte-marie: every page declares hreflang="en" for `/?lang=en`,
  // which serves the French home; L5 reports it and must keep reading it.
  it('keeps a query page another page declares as its hreflang alternate', () => {
    const home = 'https://clos-sainte-marie.fr/';
    const english = 'https://clos-sainte-marie.fr/?lang=en';
    const marked = markQueryVariants(
      [visited(home), visited(english)],
      [
        { pageUrl: home, canonicalUrls: [home], hreflangUrls: [home, english] },
        { pageUrl: english, canonicalUrls: [home], hreflangUrls: [home, english] },
      ],
    );

    expect(statusOf(marked, english)?.status).toBe('visited');
  });
});
