import { describe, expect, it } from 'vitest';
import { deriveSiteNameFromTitleFrequency } from './write-audit.js';

/**
 * B1.1 (2026-08-24). Titles below are verbatim from the real
 * artifacts/www.lagnonu.fr/2026-08-24T16-45-59Z scan, whose report cover
 * named the client "Mariages et evenements prives".
 */
const LAGNONU_TITLES = [
  'Domaine Lagnonu | Mariages et événements privés',
  'Domaine Lagnonu | Les suites',
  'Domaine Lagnonu | Les villas',
  'Domaine Lagnonu | Contact et coordonnées',
  'Domaine Lagnonu | Blog',
  'Domaine Lagnonu | Séminaires et galas',
  'Lagnonu - Coti-Chiavari | La table gastronomique',
  'Hôtel de luxe Corse du Sud à Ajaccio : Votre séjour dans un hébergement de luxe',
];

describe('deriveSiteNameFromTitleFrequency', () => {
  it('picks the brand that recurs, not the page topic that does not', () => {
    expect(deriveSiteNameFromTitleFrequency(LAGNONU_TITLES)).toBe('Domaine Lagnonu');
  });

  it('works for the opposite "Page | Site" convention too', () => {
    const titles = [
      'Nos chambres | Hôtel Bellevue',
      'Contact | Hôtel Bellevue',
      'Restaurant | Hôtel Bellevue',
    ];
    expect(deriveSiteNameFromTitleFrequency(titles)).toBe('Hôtel Bellevue');
  });

  it('returns undefined when nothing recurs, leaving the per-page chain to decide', () => {
    const titles = ['Accueil | Une page', 'Contact | Une autre page'];
    expect(deriveSiteNameFromTitleFrequency(titles)).toBeUndefined();
  });

  it('returns undefined when no title has a separator at all', () => {
    expect(
      deriveSiteNameFromTitleFrequency(['Bienvenue chez nous', 'Bienvenue chez nous']),
    ).toBeUndefined();
  });

  it('ignores a recurring segment too long to be a name', () => {
    const long =
      'Votre séjour dans un hébergement de grand luxe au coeur du Golfe d Ajaccio en Corse';
    expect(
      deriveSiteNameFromTitleFrequency([`Accueil | ${long}`, `Contact | ${long}`]),
    ).toBeUndefined();
  });

  it('tolerates empty and whitespace-only titles', () => {
    expect(
      deriveSiteNameFromTitleFrequency(['', '   ', 'Domaine X | Accueil', 'Domaine X | Contact']),
    ).toBe('Domaine X');
  });

  it('counts a segment once per title, so one repetitive title cannot win alone', () => {
    expect(deriveSiteNameFromTitleFrequency(['Marque | Marque | Marque'])).toBeUndefined();
  });

  // Issue #79 (Le Grand Chalet, real audit d9d9ec5e-ed0d-471e-9721-c2e4d979cc06):
  // an SEO location phrase ("Hôtel La Tremblade, quartier Ronce-les-Bains")
  // tied an actual brand segment on vote count, and the old length-based
  // tiebreak picked the shorter phrase - the location keyword phrase - as
  // "the brand" every time, since terse keyword phrases tend to be shorter
  // than a descriptive brand-plus-tagline segment.
  it('returns undefined on a genuine tie rather than picking the shorter segment', () => {
    const titles = [
      'Hôtel La Tremblade, quartier Ronce-les-Bains | Hôtel Le Grand Chalet en bord de mer avec vue mer',
      'Hôtel La Tremblade, quartier Ronce-les-Bains | Hôtel Le Grand Chalet en bord de mer avec vue mer',
      'Galerie',
      'Tarifs',
    ];
    expect(deriveSiteNameFromTitleFrequency(titles)).toBeUndefined();
  });

  it('still picks a clear winner when one segment recurs strictly more than the other', () => {
    const titles = [
      'Chambres | Hôtel Bellevue',
      'Contact | Hôtel Bellevue',
      'Restaurant | Hôtel Bellevue',
      'Notre histoire | Bellevue Location Vacances',
    ];
    expect(deriveSiteNameFromTitleFrequency(titles)).toBe('Hôtel Bellevue');
  });
});
