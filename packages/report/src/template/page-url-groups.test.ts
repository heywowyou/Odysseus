import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { buildClusterLookup, countDistinctPlaces, groupPageUrlsByTranslation } from './page-url-groups.js';

const GALLERY = {
  fr: 'https://haaitza.com/galerie-hotel-de-luxe-pyla',
  en: 'https://haaitza.com/en/photo-gallery-hotels-spa-gironde',
  es: 'https://haaitza.com/es/galera',
  it: 'https://haaitza.com/it/la-galleria',
};

function manifest(): AuditManifest {
  return {
    translationClusters: [
      {
        canonicalPageUrl: GALLERY.fr,
        members: [
          { pageUrl: GALLERY.fr, lang: 'fr' },
          { pageUrl: GALLERY.en, lang: 'en' },
          { pageUrl: GALLERY.es, lang: 'es' },
          { pageUrl: GALLERY.it, lang: 'it' },
        ],
      },
      { pageUrl: 'ignored', canonicalPageUrl: 'https://haaitza.com/contact', members: [{ pageUrl: 'https://haaitza.com/contact' }] },
    ],
  } as unknown as AuditManifest;
}

describe('groupPageUrlsByTranslation', () => {
  it('collapses the four real Haaitza gallery variants into one labelled entry', () => {
    const groups = groupPageUrlsByTranslation(Object.values(GALLERY), buildClusterLookup(manifest()));
    expect(groups).toEqual([{ pageUrl: GALLERY.fr, languages: ['fr', 'en', 'es', 'it'] }]);
  });

  it('lists the canonical language first, then the rest alphabetically', () => {
    const [group] = groupPageUrlsByTranslation([GALLERY.it, GALLERY.es, GALLERY.fr], buildClusterLookup(manifest()));
    expect(group!.languages).toEqual(['fr', 'es', 'it']);
  });

  it('groups only the variants actually affected, never the whole cluster', () => {
    const [group] = groupPageUrlsByTranslation([GALLERY.fr, GALLERY.es], buildClusterLookup(manifest()));
    expect(group!.languages).toEqual(['fr', 'es']);
  });

  it('names a page that was actually flagged when the canonical one was not', () => {
    const [group] = groupPageUrlsByTranslation([GALLERY.en, GALLERY.es], buildClusterLookup(manifest()));
    expect(group!.pageUrl).toBe(GALLERY.en);
    expect(group!.languages).toEqual(['en', 'es']);
  });

  it('leaves a single affected variant as an ordinary page', () => {
    const groups = groupPageUrlsByTranslation([GALLERY.es], buildClusterLookup(manifest()));
    expect(groups).toEqual([{ pageUrl: GALLERY.es, languages: [] }]);
  });

  it('leaves pages outside any cluster untouched', () => {
    const groups = groupPageUrlsByTranslation(
      ['https://haaitza.com/contact', 'https://haaitza.com/spa'],
      buildClusterLookup(manifest()),
    );
    expect(groups.map((g) => g.languages)).toEqual([[], []]);
  });

  it('is a no-op on a manifest with no clusters recorded', () => {
    const lookup = buildClusterLookup({} as AuditManifest);
    const urls = Object.values(GALLERY);
    expect(groupPageUrlsByTranslation(urls, lookup)).toEqual([...urls].sort().map((pageUrl) => ({ pageUrl, languages: [] })));
  });
});

describe('countDistinctPlaces', () => {
  it('counts a translation group once', () => {
    const lookup = buildClusterLookup(manifest());
    expect(countDistinctPlaces([...Object.values(GALLERY), 'https://haaitza.com/contact'], lookup)).toBe(2);
  });
});
