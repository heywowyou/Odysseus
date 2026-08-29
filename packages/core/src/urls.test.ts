import { describe, expect, it } from 'vitest';
import { findContactPageUrl, isHttpUrlWithoutCredentials } from './urls.js';

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

describe('isHttpUrlWithoutCredentials', () => {
  it.each([
    'https://hotel-exemple.fr',
    'http://hotel-exemple.fr/chambres',
    'https://www.hotel-exemple.fr/reservation?nuit=2',
  ])('accepts %s', (url) => {
    expect(isHttpUrlWithoutCredentials(url)).toBe(true);
  });

  it.each([
    'https://user:pass@hotel-exemple.fr',
    'https://user@hotel-exemple.fr',
    'https://:pass@hotel-exemple.fr',
    'ftp://hotel-exemple.fr',
    'file:///etc/hostname',
    'javascript:alert(1)',
    'not a url',
    '',
    42,
    null,
  ])('rejects %s', (value) => {
    expect(isHttpUrlWithoutCredentials(value)).toBe(false);
  });
});
