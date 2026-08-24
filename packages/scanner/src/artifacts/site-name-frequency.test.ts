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
    const long = 'Votre séjour dans un hébergement de grand luxe au coeur du Golfe d Ajaccio en Corse';
    expect(deriveSiteNameFromTitleFrequency([`Accueil | ${long}`, `Contact | ${long}`])).toBeUndefined();
  });

  it('tolerates empty and whitespace-only titles', () => {
    expect(
      deriveSiteNameFromTitleFrequency(['', '   ', 'Domaine X | Accueil', 'Domaine X | Contact']),
    ).toBe('Domaine X');
  });

  it('counts a segment once per title, so one repetitive title cannot win alone', () => {
    expect(deriveSiteNameFromTitleFrequency(['Marque | Marque | Marque'])).toBeUndefined();
  });
});
