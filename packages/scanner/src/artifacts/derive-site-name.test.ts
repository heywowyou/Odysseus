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
      metadata({
        title: 'Welcome to our amazing hotel and spa in the heart of the bay of Arcachon',
      }),
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined when there is no title and no og:site_name', () => {
    expect(deriveSiteName(metadata({}))).toBeUndefined();
    expect(deriveSiteName(undefined)).toBeUndefined();
  });

  it('issue #72: ignores an og:site_name that is itself boilerplate, falling back to the bare title, exactly as the real Les Flots Bleus homepage carried it', () => {
    const result = deriveSiteName(
      metadata({
        title: 'Les Flots Bleus',
        openGraphTags: { 'og:site_name': 'Site Officiel' },
      }),
    );
    expect(result).toBe('Les Flots Bleus');
  });

  it('issue #72: falls all the way through to undefined when both og:site_name and the title are pure boilerplate', () => {
    const result = deriveSiteName(
      metadata({
        title: 'Site Officiel',
        openGraphTags: { 'og:site_name': 'Site Officiel' },
      }),
    );
    expect(result).toBeUndefined();
  });
});

/**
 * A1 (2026-08-24 three-site review): a real Palais Gallien report put
 * "Hôtel Le Palais Gallien 5***** - Bordeaux - Site Officiel" on the
 * cover as the client's own name, and a real La Corniche report printed
 * the generic fallback because the only page consulted for a name had
 * timed out. These lock both halves.
 */
describe('deriveSiteName marketing-noise stripping', () => {
  it('drops a star rating and a trailing "Site Officiel" from the real Palais Gallien title', () => {
    expect(
      deriveSiteName(
        metadata({ title: 'Hôtel Le Palais Gallien 5***** - Bordeaux - Site Officiel' }),
      ),
    ).toBe('Hôtel Le Palais Gallien - Bordeaux');
  });

  it('keeps a segment that carries real information, even trailing', () => {
    expect(deriveSiteName(metadata({ title: 'Hôtel du Port - Arcachon' }))).toBe(
      'Hôtel du Port - Arcachon',
    );
  });

  it('drops several stacked boilerplate segments', () => {
    expect(
      deriveSiteName(
        metadata({ title: 'Domaine des Trois Chenes - Réservation en ligne - Accueil' }),
      ),
    ).toBe('Domaine des Trois Chenes');
  });

  it('strips a spelled-out star rating too', () => {
    expect(deriveSiteName(metadata({ title: 'Villa Marine 4 étoiles - Site officiel' }))).toBe(
      'Villa Marine',
    );
  });

  it('still applies the cleanup to a separator-delimited brand segment', () => {
    expect(deriveSiteName(metadata({ title: 'Chambre Deluxe | Villa Marine 5 étoiles' }))).toBe(
      'Villa Marine',
    );
  });

  it('leaves an already-clean bare title untouched', () => {
    expect(deriveSiteName(metadata({ title: 'Domaine des Trois Chenes' }))).toBe(
      'Domaine des Trois Chenes',
    );
  });
});
