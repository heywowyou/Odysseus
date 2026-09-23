import { describe, expect, it } from 'vitest';
import {
  extractUntranslatedTitleCandidates,
  TITLE_NOT_TRANSLATED_RULE_ID,
} from './normalize-untranslated-title.js';
import type { TranslationCluster } from './translation-clusters.js';

const site = 'https://hotel.example';

/** The shape of a real hotel site: every English and Spanish page, reached
 *  through the language menu, keeps its French twin's title verbatim. */
const pages = [
  { fr: '/fr/chambres', en: '/en/rooms', es: '/es/habitaciones', title: 'Chambres - Hotel X' },
  { fr: '/fr/galerie', en: '/en/gallery', es: '/es/galeria', title: 'Galerie - Hotel X' },
  { fr: '/fr/spa', en: '/en/spa', es: '/es/spa', title: 'Spa Bordeaux - Hotel X' },
  { fr: '/fr/contact', en: '/en/contact', es: '/es/contactar', title: 'Contact - Hotel X' },
];

function clustersOf(rows: typeof pages): TranslationCluster[] {
  return rows.map((row) => ({
    canonicalPageUrl: site + row.en,
    derivation: 'language-switcher',
    members: [
      { pageUrl: site + row.en, lang: 'en' },
      { pageUrl: site + row.es, lang: 'es' },
      { pageUrl: site + row.fr, lang: 'fr' },
    ],
  }));
}

function titles(rows: typeof pages, translate: (row: (typeof pages)[number]) => boolean) {
  const map = new Map<string, string | null>();
  for (const row of rows) {
    map.set(site + row.fr, row.title);
    map.set(site + row.en, translate(row) ? `EN ${row.title}` : row.title);
    map.set(site + row.es, row.title);
  }
  return map;
}

describe('title-not-translated', () => {
  it('reports each language whose pages keep the primary-language title', () => {
    const candidates = extractUntranslatedTitleCandidates({
      clusters: clustersOf(pages),
      titleByPageUrl: titles(pages, () => false),
      siteLevelPageUrl: `${site}/fr`,
    });

    expect(candidates).toHaveLength(8);
    expect(candidates.every((c) => c.ruleId === TITLE_NOT_TRANSLATED_RULE_ID)).toBe(true);
    expect(new Set(candidates.map((c) => c.rawEvidenceForPage?.['language']))).toEqual(
      new Set(['en', 'es']),
    );
    const spanishRooms = candidates.find((c) => c.pageUrl === `${site}/es/habitaciones`);
    expect(spanishRooms?.rawEvidenceForPage).toMatchObject({
      primaryPageUrl: `${site}/fr/chambres`,
      untranslatedPairCount: 4,
      pairCount: 4,
    });
  });

  it('ignores a translated language where only a few titles coincide', () => {
    const candidates = extractUntranslatedTitleCandidates({
      clusters: clustersOf(pages),
      titleByPageUrl: titles(pages, (row) => row.en !== '/en/contact'),
      siteLevelPageUrl: `${site}/fr`,
    });

    expect(candidates.some((c) => c.pageUrl.startsWith(`${site}/en/`))).toBe(false);
    expect(candidates.filter((c) => c.pageUrl.startsWith(`${site}/es/`))).toHaveLength(4);
  });

  it('needs enough pairs to tell a pattern from coincidence', () => {
    expect(
      extractUntranslatedTitleCandidates({
        clusters: clustersOf(pages.slice(0, 2)),
        titleByPageUrl: titles(pages.slice(0, 2), () => false),
        siteLevelPageUrl: `${site}/fr`,
      }),
    ).toEqual([]);
  });

  it('reports nothing when the primary language is unknown', () => {
    expect(
      extractUntranslatedTitleCandidates({
        clusters: clustersOf(pages),
        titleByPageUrl: titles(pages, () => false),
        siteLevelPageUrl: `${site}/`,
      }),
    ).toEqual([]);
  });
});
