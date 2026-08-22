/**
 * 2026-08-22, La Corniche report review: `deriveSiteName` (write-audit.ts)
 * feeds `AuditManualFields.nomCommercial`'s auto-fill (packages/store's
 * `prefillAuditManualFields`) - Sirene has no reliable "commercial name"
 * field for many real companies (confirmed against the live API for a
 * real client: siege.nom_commercial, enseigne_1/2/3 and liste_enseignes
 * were all null), but the homepage's own head metadata usually does.
 */
import { describe, expect, it } from 'vitest';
import { deriveSiteName } from './write-audit.js';
import type { HeadMetadataExtraction } from '../checks/head-metadata.js';

function metadata(overrides: Partial<HeadMetadataExtraction>): HeadMetadataExtraction {
  return {
    pageUrl: 'https://example.com/',
    title: null,
    metaDescription: null,
    canonicalUrls: [],
    openGraphTags: {},
    jsonLdBlocks: [],
    headings: [],
    hreflangLinks: [],
    robotsMeta: null,
    ...overrides,
  } as HeadMetadataExtraction;
}

describe('deriveSiteName', () => {
  it('prefers og:site_name when present, exactly as the real La Corniche homepage carries it', () => {
    const result = deriveSiteName(
      metadata({
        title: '~ La Co(o)rniche, 5 Étoiles | Hôtel Restaurant & Spa, La Dune du Pyla',
        openGraphTags: { 'og:site_name': 'La Co(o)rniche' },
      }),
    );
    expect(result).toBe('La Co(o)rniche');
  });

  it('falls back to the last "|"-delimited title segment when og:site_name is absent', () => {
    const result = deriveSiteName(metadata({ title: 'Chambre Deluxe | La Co(o)rniche' }));
    expect(result).toBe('La Co(o)rniche');
  });

  it('falls back to the last em-dash-delimited title segment', () => {
    const result = deriveSiteName(metadata({ title: 'Chambre Deluxe — La Co(o)rniche' }));
    expect(result).toBe('La Co(o)rniche');
  });

  it('never splits on a plain hyphen, since it appears inside real names', () => {
    const result = deriveSiteName(metadata({ title: 'Restaurant Jean-Pierre' }));
    expect(result).toBe('Restaurant Jean-Pierre');
  });

  it('uses the bare title when short and separator-free, matching fixtures/spa-demo', () => {
    const result = deriveSiteName(metadata({ title: 'Domaine des Trois Chenes' }));
    expect(result).toBe('Domaine des Trois Chenes');
  });

  it('does not guess from a long, separator-free title - too likely a descriptive sentence, not a name', () => {
    const result = deriveSiteName(
      metadata({ title: 'Welcome to our amazing hotel and spa in the heart of the bay of Arcachon' }),
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined when there is no title and no og:site_name', () => {
    expect(deriveSiteName(metadata({}))).toBeUndefined();
    expect(deriveSiteName(undefined)).toBeUndefined();
  });
});
