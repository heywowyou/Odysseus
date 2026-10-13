import { describe, expect, it } from 'vitest';
import type { ManifestPageEntry } from '../types/manifest.js';
import { isDeadLinkRender, nameDeadLinkReferrers } from './dead-link-pages.js';
import { isBlockedRender } from './normalize-renderdiff.js';
import { buildRenderDiffResult } from './fixtures.js';

// domaine-d-auriac, 2026-09-28: the site wrote its email address as a
// relative link; the target answered the site's own « Page non trouvée ».
const auriac404 = buildRenderDiffResult({
  pageUrl: 'https://domaine-d-auriac.fr/solde-de-la-carte-cadeau/auriac@relaischateaux.com',
  httpStatus: 404,
  renderedHttpStatus: 404,
  rawTextLength: 3018,
  renderedTextLength: 1382,
  renderedTitle: "Page non trouvée - Domaine d'Auriac",
  renderedInterstitialMarkers: [],
});

// yonahotel, 2026-09-28: `<a href="&quot;/fr/formulaire-GDPR&quot;">`, a
// sparse 404 template.
const yona404 = buildRenderDiffResult({
  pageUrl: 'https://www.yonahotel.com/en/%22/fr/formulaire-GDPR%22',
  httpStatus: 404,
  renderedHttpStatus: 404,
  rawTextLength: 68,
  renderedTextLength: 70,
  renderedTitle: '~ Page non trouvée | Le Parc Hôtel devient YONA',
  renderedInterstitialMarkers: [],
});

// le37bishotel-paris, 2026-09-25: DataDome on the booking page.
const dataDome = buildRenderDiffResult({
  httpStatus: 200,
  renderedHttpStatus: 200,
  rawTextLength: 273,
  renderedTextLength: 441,
  renderedTitle: 'An error has occured.',
  renderedInterstitialMarkers: ['datadome-challenge'],
});

describe('isDeadLinkRender', () => {
  it('reads the site own 404 and 410 templates as dead links, sparse or not', () => {
    expect(isDeadLinkRender(auriac404)).toBe(true);
    expect(isDeadLinkRender(yona404)).toBe(true);
    expect(isDeadLinkRender({ ...auriac404, httpStatus: 410, renderedHttpStatus: 410 })).toBe(true);
    // Still out of the analysed population.
    expect(isBlockedRender(auriac404)).toBe(true);
  });

  it('keeps refusals and challenges as blocked', () => {
    expect(isDeadLinkRender(dataDome)).toBe(false);
    for (const status of [403, 429, 503]) {
      expect(
        isDeadLinkRender({ ...auriac404, httpStatus: status, renderedHttpStatus: status }),
      ).toBe(false);
    }
    expect(
      isDeadLinkRender({
        ...auriac404,
        renderedInterstitialMarkers: ['bot-challenge'],
        renderedTextLength: 40,
      }),
    ).toBe(false);
    expect(isDeadLinkRender(undefined)).toBe(false);
  });
});

// lacasernechanzy, 2026-10-10: a link whose href resolved the site's own
// address as a path. The site answers 403, with its own template, to every
// path it does not know, and that one page held the report.
const addressAsPath403 = buildRenderDiffResult({
  pageUrl: 'https://www.lacasernechanzy.com/https://www.lacasernechanzy.com',
  httpStatus: 403,
  renderedHttpStatus: 403,
  rawTextLength: 1234,
  renderedTextLength: 1234,
  renderedTitle: 'La Caserne Chanzy',
  renderedInterstitialMarkers: [],
});

describe('a link that wrote an address as a path', () => {
  it('is a dead link whatever client error the site answers it with', () => {
    expect(isDeadLinkRender(addressAsPath403)).toBe(true);
    expect(
      isDeadLinkRender({
        ...addressAsPath403,
        pageUrl: 'https://hotel.example/fr/contact/mailto:accueil@hotel.example',
        httpStatus: 400,
        renderedHttpStatus: 400,
      }),
    ).toBe(true);
  });

  it('stays blocked when the answer is a rate limit, a server error or a challenge', () => {
    for (const status of [429, 503]) {
      expect(
        isDeadLinkRender({ ...addressAsPath403, httpStatus: status, renderedHttpStatus: status }),
      ).toBe(false);
    }
    expect(
      isDeadLinkRender({
        ...addressAsPath403,
        renderedInterstitialMarkers: ['bot-challenge'],
        renderedTextLength: 40,
      }),
    ).toBe(false);
  });

  it('does not excuse a refusal on a path a page could live at', () => {
    expect(
      isDeadLinkRender({ ...addressAsPath403, pageUrl: 'https://www.lacasernechanzy.com/fr/spa' }),
    ).toBe(false);
  });
});

describe('nameDeadLinkReferrers', () => {
  const dead = (url: string, extra: Partial<ManifestPageEntry> = {}): ManifestPageEntry =>
    ({
      url,
      status: 'http-error-status',
      depth: 2,
      discoveryMethod: 'link',
      httpStatus: 404,
      ...extra,
    }) as ManifestPageEntry;

  it('names the page whose post-render links reach a dead link', () => {
    const target = 'https://www.yonahotel.com/en/%22/fr/formulaire-GDPR%22';
    const [entry] = nameDeadLinkReferrers(
      [dead(target)],
      [{ url: 'https://www.yonahotel.com/en/privacy-policy', surfaceLinks: [{ url: target }] }],
      new Set([target]),
    );
    expect(entry?.discoveredFrom).toBe('https://www.yonahotel.com/en/privacy-policy');
  });

  it('keeps a recorded referrer and leaves entries the verdict did not decide alone', () => {
    const recorded = dead(auriac404.pageUrl, { discoveredFrom: 'https://domaine-d-auriac.fr/' });
    const crawlTime = dead('https://domaine-d-auriac.fr/old');
    const [first, second] = nameDeadLinkReferrers(
      [recorded, crawlTime],
      [
        {
          url: 'https://domaine-d-auriac.fr/contact',
          surfaceLinks: [{ url: auriac404.pageUrl }, { url: 'https://domaine-d-auriac.fr/old' }],
        },
      ],
      new Set([auriac404.pageUrl]),
    );
    expect(first?.discoveredFrom).toBe('https://domaine-d-auriac.fr/');
    expect(second?.discoveredFrom).toBeUndefined();
  });
});
