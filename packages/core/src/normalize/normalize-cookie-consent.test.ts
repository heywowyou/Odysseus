import { describe, expect, it } from 'vitest';
import { normalizeCookieConsent, type CookieConsentCheckInput } from './normalize-cookie-consent.js';

const HOMEPAGE = 'https://example.com/';

function input(overrides: Partial<CookieConsentCheckInput> = {}): CookieConsentCheckInput {
  return {
    checked: true,
    nonEssentialCookies: [],
    trackerRequests: [],
    consentPlatforms: [],
    usesTrackingYouTubeEmbed: false,
    ...overrides,
  };
}

const ruleIds = (i: CookieConsentCheckInput) => normalizeCookieConsent(i, HOMEPAGE).map((c) => c.ruleId);

describe('normalizeCookieConsent', () => {
  it('emits nothing when the check did not run', () => {
    expect(
      normalizeCookieConsent(
        input({ checked: false, nonEssentialCookies: [{ name: '_ga', domain: '.example.com', vendor: 'Google Analytics', isThirdParty: false }] }),
        HOMEPAGE,
      ),
    ).toEqual([]);
  });

  it('emits nothing for a site with no non-essential cookies and no trackers', () => {
    expect(normalizeCookieConsent(input(), HOMEPAGE)).toEqual([]);
  });

  it('reports a tracking cookie written before consent', () => {
    const ids = ruleIds(
      input({
        nonEssentialCookies: [{ name: '_ga', domain: '.example.com', vendor: 'Google Analytics', isThirdParty: false }],
        consentPlatforms: ['Axeptio'],
      }),
    );
    expect(ids).toContain('cookie-non-essential-before-consent');
  });

  it('reports a tracker request separately from a cookie, since a vendor can track without one', () => {
    const ids = ruleIds(
      input({
        trackerRequests: [{ host: 'www.google-analytics.com', vendor: 'Google Analytics' }],
        consentPlatforms: ['Axeptio'],
      }),
    );
    expect(ids).toEqual(['tracker-request-before-consent']);
  });

  it('reports an absent consent mechanism only when something non-essential is actually active', () => {
    expect(ruleIds(input({ consentPlatforms: [] }))).toEqual([]);
    expect(
      ruleIds(input({ trackerRequests: [{ host: 'connect.facebook.net', vendor: 'Meta Pixel' }] })),
    ).toContain('consent-mechanism-absent');
  });

  it('does not report an absent mechanism when a consent platform was recognised', () => {
    expect(
      ruleIds(
        input({
          trackerRequests: [{ host: 'connect.facebook.net', vendor: 'Meta Pixel' }],
          consentPlatforms: ['Didomi'],
        }),
      ),
    ).not.toContain('consent-mechanism-absent');
  });

  it('reports a tracking YouTube embed', () => {
    expect(ruleIds(input({ usesTrackingYouTubeEmbed: true }))).toContain('youtube-tracking-embed');
  });

  it('files every finding under the privacy category with no WCAG criterion', () => {
    const candidates = normalizeCookieConsent(
      input({
        nonEssentialCookies: [{ name: '_fbp', domain: '.example.com', vendor: 'Meta Pixel', isThirdParty: false }],
        trackerRequests: [{ host: 'connect.facebook.net', vendor: 'Meta Pixel' }],
        usesTrackingYouTubeEmbed: true,
      }),
      HOMEPAGE,
    );
    expect(candidates).toHaveLength(4);
    for (const candidate of candidates) {
      expect(candidate.category).toBe('privacy');
      expect(candidate.wcagCriteria).toEqual([]);
      expect(candidate.pageUrl).toBe(HOMEPAGE);
    }
  });

  it('never states that the client is in breach, only what was observed', () => {
    const text = normalizeCookieConsent(
      input({ nonEssentialCookies: [{ name: '_ga', domain: '.example.com', vendor: 'Google Analytics', isThirdParty: false }] }),
      HOMEPAGE,
    )
      .map((c) => `${c.title} ${c.description}`)
      .join(' ')
      .toLowerCase();
    for (const forbidden of ['illegal', 'in breach', 'violation of', 'you must', 'fine of', 'unlawful']) {
      expect(text, `description asserts a legal conclusion: "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('lists vendors in a stable order, so a re-scan dedupes to the same finding', () => {
    const cookies = [
      { name: '_fbp', domain: '.example.com', vendor: 'Meta Pixel', isThirdParty: false },
      { name: '_ga', domain: '.example.com', vendor: 'Google Analytics', isThirdParty: false },
    ];
    const forward = normalizeCookieConsent(input({ nonEssentialCookies: cookies }), HOMEPAGE)[0]!.description;
    const reverse = normalizeCookieConsent(input({ nonEssentialCookies: [...cookies].reverse() }), HOMEPAGE)[0]!.description;
    expect(reverse).toBe(forward);
  });
});

/**
 * C5 (2026-08-24): the third-party inventory rides on the same single
 * load as the cookie check rather than costing a second navigation.
 */
describe('C5: third-party data transfer inventory', () => {
  const origins = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ origin: `https://provider${i}.com`, requestCount: 1 }));

  it('emits nothing below the reporting threshold', () => {
    expect(ruleIds(input({ thirdPartyOrigins: origins(4) }))).not.toContain('third-party-data-transfer');
  });

  it('emits an inventory at or above the threshold', () => {
    expect(ruleIds(input({ thirdPartyOrigins: origins(5) }))).toContain('third-party-data-transfer');
  });

  it('emits nothing when the field is absent, so an older scan still normalizes', () => {
    expect(ruleIds(input())).toEqual([]);
  });

  it('names every provider, since a partial list is not an inventory', () => {
    const description = normalizeCookieConsent(input({ thirdPartyOrigins: origins(7) }), HOMEPAGE).find(
      (c) => c.ruleId === 'third-party-data-transfer',
    )!.description;
    for (let i = 0; i < 7; i += 1) expect(description).toContain(`provider${i}.com`);
  });

  it('states it is an inventory, never that a transfer is unlawful', () => {
    const description = normalizeCookieConsent(input({ thirdPartyOrigins: origins(6) }), HOMEPAGE).find(
      (c) => c.ruleId === 'third-party-data-transfer',
    )!.description;
    expect(description).toContain('inventory, not a judgment');
    for (const forbidden of ['unlawful', 'illegal', 'in breach', 'you must']) {
      expect(description.toLowerCase()).not.toContain(forbidden);
    }
  });
});
