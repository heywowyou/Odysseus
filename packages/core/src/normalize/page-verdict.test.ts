import { describe, expect, it } from 'vitest';
import type { ManifestPageEntry, PageAnalysisCoverage } from '../types/manifest.js';
import { buildRenderDiffResult } from './fixtures.js';
import {
  applyScannedPageVerdict,
  decideScannedPageStatus,
  type ScannedPageFacts,
  type ScannedPageVerdict,
} from './page-verdict.js';

const PAGE = 'https://hotel.example/chambres';

const content = buildRenderDiffResult({
  pageUrl: PAGE,
  httpStatus: 200,
  renderedHttpStatus: 200,
  rawTextLength: 2400,
  renderedTextLength: 2600,
  renderedTitle: 'Nos chambres',
  renderedInterstitialMarkers: [],
});

// domaine-d-auriac, 2026-09-28: the site's own « Page non trouvée » template.
const siteOwn404 = buildRenderDiffResult({
  pageUrl: PAGE,
  httpStatus: 404,
  renderedHttpStatus: 404,
  rawTextLength: 3018,
  renderedTextLength: 1382,
  renderedTitle: "Page non trouvée - Domaine d'Auriac",
  renderedInterstitialMarkers: [],
});

const challenge = buildRenderDiffResult({
  pageUrl: PAGE,
  httpStatus: 403,
  renderedHttpStatus: 403,
  rawTextLength: 120,
  renderedTextLength: 140,
  renderedTitle: 'Just a moment...',
  renderedInterstitialMarkers: ['bot-challenge'],
});

describe('decideScannedPageStatus precedence (issue #565)', () => {
  it.each([
    {
      name: 'a render that settled elsewhere is a redirect, even over a refusal',
      facts: {
        url: PAGE,
        renderDiff: challenge,
        renderedLandedUrl: 'https://hotel.example/',
      },
      expected: { status: 'redirect-interstitial', redirectTargetUrl: 'https://hotel.example/' },
    },
    {
      name: 'a Lighthouse run that ended on another site is a redirect',
      facts: {
        url: PAGE,
        renderDiff: content,
        lighthouseFinalUrl: 'https://booking.engine.example/hotel',
      },
      expected: {
        status: 'redirect-interstitial',
        redirectTargetUrl: 'https://booking.engine.example/hotel',
      },
    },
    {
      name: 'the site own 404 template is a dead link, not blocked',
      facts: { url: PAGE, renderDiff: siteOwn404, title: "Page non trouvée - Domaine d'Auriac" },
      expected: { status: 'http-error-status', httpStatus: 404 },
    },
    {
      name: 'a challenge is blocked',
      facts: { url: PAGE, renderDiff: challenge },
      expected: { status: 'blocked' },
    },
    {
      name: 'an error slug is a soft 404',
      facts: {
        url: 'https://hotel.example/erreur-404',
        renderDiff: content,
        renderedLandedUrl: 'https://hotel.example/erreur-404',
        title: 'Hôtel',
      },
      expected: { status: 'soft-error-page' },
    },
    {
      name: 'an error title with a content heading is visited',
      facts: {
        url: PAGE,
        renderDiff: content,
        title: 'Page introuvable',
        headings: [{ level: 2, text: 'Séjour insolite pour deux' }],
      },
      expected: { status: 'visited' },
    },
    {
      name: 'an error title with no heading is visited',
      facts: { url: PAGE, renderDiff: content, title: 'Page introuvable', headings: [] },
      expected: { status: 'visited' },
    },
    {
      name: 'a page that settled on itself, with a trailing slash, is visited',
      facts: { url: PAGE, renderDiff: content, renderedLandedUrl: `${PAGE}/` },
      expected: { status: 'visited' },
    },
  ] satisfies { name: string; facts: ScannedPageFacts; expected: ScannedPageVerdict }[])(
    '$name',
    ({ facts, expected }) => {
      expect(decideScannedPageStatus(facts)).toEqual(expected);
    },
  );
});

describe('applyScannedPageVerdict', () => {
  const coverage = { plannerVersion: 'v3', role: 'content' } as unknown as PageAnalysisCoverage;
  const entry = (extra: Partial<ManifestPageEntry>): ManifestPageEntry =>
    ({ url: PAGE, depth: 1, errors: {}, ...extra }) as ManifestPageEntry;

  it('sets a non-content page coverage aside and restores it when the page is content again', () => {
    const softError = applyScannedPageVerdict(
      entry({ status: 'visited', analysisCoverage: coverage }),
      { status: 'soft-error-page' },
    );
    expect(softError.analysisCoverage).toBeUndefined();
    expect(softError.setAsideAnalysisCoverage).toBe(coverage);

    const visited = applyScannedPageVerdict(softError, { status: 'visited' });
    expect(visited.analysisCoverage).toBe(coverage);
    expect(visited.setAsideAnalysisCoverage).toBeUndefined();
  });

  it('drops a stale redirect target when the page is no longer a redirect', () => {
    const visited = applyScannedPageVerdict(
      entry({ status: 'redirect-interstitial', redirectTargetUrl: 'https://hotel.example/' }),
      { status: 'visited' },
    );
    expect(visited.redirectTargetUrl).toBeUndefined();
  });
});

// yonahotel.com, 2026-09-30: any unknown /en/ path answers 200 with one
// `noindex` document headed « Elsewhere starts Here », no error title.
describe('a page that is the site catch-all (plan 075 M7)', () => {
  const shell = buildRenderDiffResult({
    pageUrl: PAGE,
    httpStatus: 200,
    renderedHttpStatus: 200,
    rawTextLength: 937,
    renderedTextLength: 937,
    renderedInterstitialMarkers: [],
    rawDocument: {
      markupLength: 240361,
      visibleTextLength: 937,
      textSignature: '73a58f695ec9d7de',
      interstitialMarkers: [],
    },
  });
  const facts: ScannedPageFacts = {
    url: 'https://hotel.example/en/terms-of-use',
    renderDiff: shell,
    title: null,
    headings: [{ level: 2, text: 'Elsewhere starts Here' }],
  };

  it('is a soft 404 when its raw document matches a catch-all answer', () => {
    expect(
      decideScannedPageStatus(facts, { catchAllTextSignatures: new Set(['73a58f695ec9d7de']) }),
    ).toEqual({ status: 'soft-error-page' });
  });

  it('stays content without a probe or with another signature', () => {
    expect(decideScannedPageStatus(facts)).toEqual({ status: 'visited' });
    expect(
      decideScannedPageStatus(facts, { catchAllTextSignatures: new Set(['fb72410266aad108']) }),
    ).toEqual({ status: 'visited' });
  });
});

describe('a non-HTML answer (plan 075 M4)', () => {
  it('is set aside when the raw answer is a feed', () => {
    expect(
      decideScannedPageStatus({
        url: 'https://leprieuredeboulogne.com/feed',
        renderDiff: content,
        rawContentType: 'application/rss+xml; charset=UTF-8',
      }),
    ).toEqual({ status: 'skipped-non-html' });
  });

  it('stays content for HTML, XHTML or an unknown type', () => {
    for (const rawContentType of ['text/html; charset=utf-8', 'application/xhtml+xml', undefined]) {
      expect(
        decideScannedPageStatus({
          url: PAGE,
          renderDiff: content,
          ...(rawContentType !== undefined ? { rawContentType } : {}),
        }).status,
      ).toBe('visited');
    }
  });
});
