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
