import { describe, expect, it } from 'vitest';
import { isRedirectInterstitial } from './page-verdict.js';

describe('isRedirectInterstitial', () => {
  it('is false when the rendered page settled on the requested URL', () => {
    expect(isRedirectInterstitial('https://hotel.example/', 'https://hotel.example/')).toBe(false);
  });

  it('is true when a client-side script moved the browser to another host', () => {
    // The 1924 HÔTEL case: the apex domain lands the browser on the www
    // host after a client-side check, and every scanner reading this page
    // must recognize it never actually rendered the requested page.
    expect(isRedirectInterstitial('https://1924hotel.com/', 'https://www.1924hotel.com/')).toBe(
      true,
    );
  });

  it('is true when the landed URL differs only in path', () => {
    expect(isRedirectInterstitial('https://hotel.example/', 'https://hotel.example/blocked')).toBe(
      true,
    );
  });

  it('is false when the only difference is a trailing slash normalizePageUrl already collapses', () => {
    expect(isRedirectInterstitial('https://hotel.example', 'https://hotel.example/')).toBe(false);
  });
});
