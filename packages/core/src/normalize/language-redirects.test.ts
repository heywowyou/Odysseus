import { describe, expect, it } from 'vitest';
import type { ManifestPageEntry } from '../types/manifest.js';
import { markLanguageRedirects } from './language-redirects.js';

const origin = 'https://grandhoteldesalpes.com';

function redirect(url: string, target: string): ManifestPageEntry {
  return {
    url: `${origin}${url}`,
    pageDir: '',
    depth: 1,
    status: 'redirect-interstitial',
    discoveryMethod: 'sitemap-only',
    redirectTargetUrl: `${origin}${target}`,
    errors: {},
  };
}

// The shapes are the stored grandhoteldesalpes rescan of 2026-09-24: WPML
// sends a French browser from each English or Italian page to its French
// translation, whose hreflang and switcher links list the page it came from.
const frenchRoomAlternates = {
  pageUrl: `${origin}/fr/rooms/chambre-single/`,
  alternateUrls: [
    `${origin}/en/rooms/single-room/`,
    `${origin}/it/camere/camera-singola/`,
    `${origin}/fr/rooms/chambre-single/#`,
  ],
};

describe('markLanguageRedirects', () => {
  it('marks a redirect onto a page that lists the source as its alternate', () => {
    const [english, italian] = markLanguageRedirects(
      [
        redirect('/en/rooms/single-room', '/fr/rooms/chambre-single'),
        redirect('/it/camere/camera-singola/', '/fr/rooms/chambre-single/'),
      ],
      [frenchRoomAlternates],
    );

    expect(english!.status).toBe('language-redirect');
    expect(italian!.status).toBe('language-redirect');
    expect(english!.redirectTargetUrl).toBe(`${origin}/fr/rooms/chambre-single`);
  });

  it('keeps a slug rename a redirect: the landing page does not list the old URL', () => {
    const [renamed] = markLanguageRedirects(
      [redirect('/fr/chambres/chambre-single', '/fr/rooms/chambre-single')],
      [frenchRoomAlternates],
    );

    expect(renamed!.status).toBe('redirect-interstitial');
  });

  it('keeps the root sent to a language home a redirect when the home does not list it', () => {
    const [root] = markLanguageRedirects(
      [redirect('/', '/fr')],
      [{ pageUrl: `${origin}/fr/`, alternateUrls: [`${origin}/en/`, `${origin}/it/`] }],
    );

    expect(root!.status).toBe('redirect-interstitial');
  });

  it('keeps a redirect whose landing page was never scanned', () => {
    const [unscanned] = markLanguageRedirects(
      [redirect('/en/rooms/single-room', '/fr/rooms/chambre-single')],
      [],
    );

    expect(unscanned!.status).toBe('redirect-interstitial');
  });

  it('never changes a page that is not a redirect interstitial', () => {
    const visited: ManifestPageEntry = {
      ...redirect('/en/rooms/single-room', '/fr/rooms/chambre-single'),
      status: 'visited',
    };

    expect(markLanguageRedirects([visited], [frenchRoomAlternates])).toEqual([visited]);
  });
});
