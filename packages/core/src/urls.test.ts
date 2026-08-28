import { describe, expect, it } from 'vitest';
import { findContactPageUrl } from './urls.js';

describe('findContactPageUrl', () => {
  it.each([
    'https://hotel-exemple.fr/contact',
    'https://hotel-exemple.fr/nous-contacter/',
    'https://hotel-exemple.fr/contactez-nous',
    'https://hotel-exemple.fr/coordonnees',
  ])('matches %s', (url) => {
    expect(findContactPageUrl([url])).toBe(url);
  });

  it('does not match an unrelated page', () => {
    expect(findContactPageUrl(['https://hotel-exemple.fr/chambres'])).toBeNull();
  });

  it('returns the first match, matching findMentionsLegalesUrl own contract', () => {
    expect(
      findContactPageUrl([
        'https://hotel-exemple.fr/spa',
        'https://hotel-exemple.fr/contact',
        'https://hotel-exemple.fr/coordonnees',
      ]),
    ).toBe('https://hotel-exemple.fr/contact');
  });

  it('is null for an empty list', () => {
    expect(findContactPageUrl([])).toBeNull();
  });
});
