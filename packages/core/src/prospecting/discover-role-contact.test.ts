import { describe, expect, it } from 'vitest';
import { discoverRoleContact, type ContactTextSource } from './discover-role-contact.js';

function homepage(text: string, mailtoTargets?: string[]): ContactTextSource {
  return {
    kind: 'homepage',
    url: 'https://hotel-exemple.fr/',
    text,
    ...(mailtoTargets === undefined ? {} : { mailtoTargets }),
  };
}

describe('discoverRoleContact', () => {
  it('finds a role address on the hotel own domain', () => {
    const result = discoverRoleContact(
      [homepage('Nous écrire: contact@hotel-exemple.fr')],
      'hotel-exemple.fr',
    );
    expect(result).toMatchObject({
      outcome: 'found',
      address: 'contact@hotel-exemple.fr',
      localPart: 'contact',
      source: 'homepage',
      sourceUrl: 'https://hotel-exemple.fr/',
    });
  });

  it('prefers the better-ranked address over the one printed first', () => {
    const result = discoverRoleContact(
      [homepage('reservation@hotel-exemple.fr ou direction@hotel-exemple.fr')],
      'hotel-exemple.fr',
    );
    expect(result).toMatchObject({ outcome: 'found', localPart: 'direction' });
  });

  it('keeps the earlier source when two pages publish the same rank', () => {
    const result = discoverRoleContact(
      [
        homepage('contact@hotel-exemple.fr'),
        {
          kind: 'contact-page',
          url: 'https://hotel-exemple.fr/contact',
          text: 'contact@hotel-exemple.fr',
        },
      ],
      'hotel-exemple.fr',
    );
    expect(result).toMatchObject({ outcome: 'found', source: 'homepage' });
  });

  it('reads a mailto target the visible text never spells out', () => {
    const result = discoverRoleContact(
      [homepage('Écrivez-nous', ['mailto:info@hotel-exemple.fr?subject=Demande'])],
      'hotel-exemple.fr',
    );
    expect(result).toMatchObject({ outcome: 'found', address: 'info@hotel-exemple.fr' });
  });

  it.each([
    ['contact [at] hotel-exemple [dot] fr'],
    ['contact(at)hotel-exemple(point)fr'],
    ['contact&#64;hotel-exemple.fr'],
    ['contact (a) hotel-exemple.fr'],
  ])('decodes bracketed obfuscation: %s', (text) => {
    const result = discoverRoleContact([homepage(text)], 'hotel-exemple.fr');
    expect(result).toMatchObject({ outcome: 'found', address: 'contact@hotel-exemple.fr' });
  });

  it('does not decode a bare "at", which is ordinary prose', () => {
    const result = discoverRoleContact(
      [homepage('Reach our team at hotel-exemple.fr for details')],
      'hotel-exemple.fr',
    );
    expect(result).toEqual({ outcome: 'absent', reason: 'no-address-published' });
  });

  it('accepts a mail subdomain of the own registrable domain', () => {
    const result = discoverRoleContact(
      [homepage('contact@mail.hotel-exemple.fr')],
      'hotel-exemple.fr',
    );
    expect(result).toMatchObject({ outcome: 'found', domain: 'mail.hotel-exemple.fr' });
  });

  it('accepts the www form on either side', () => {
    const result = discoverRoleContact(
      [homepage('contact@www.hotel-exemple.fr')],
      'www.hotel-exemple.fr',
    );
    expect(result).toMatchObject({ outcome: 'found' });
  });

  it('rejects a named local part on the own domain, with the reason', () => {
    const result = discoverRoleContact(
      [homepage('Jean Dupont: jean.dupont@hotel-exemple.fr')],
      'hotel-exemple.fr',
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'named-local-parts-only' });
  });

  it('never returns a named address even beside a role address it can use', () => {
    const result = discoverRoleContact(
      [homepage('jean.dupont@hotel-exemple.fr, info@hotel-exemple.fr')],
      'hotel-exemple.fr',
    );
    expect(result).toMatchObject({ outcome: 'found', localPart: 'info' });
  });

  it('rejects a free-mail address with a role local part', () => {
    const result = discoverRoleContact([homepage('contact@gmail.com')], 'hotel-exemple.fr');
    expect(result).toEqual({ outcome: 'rejected', reason: 'free-mail-only' });
  });

  it('rejects an address on somebody else own domain', () => {
    const result = discoverRoleContact([homepage('contact@agence-web.fr')], 'hotel-exemple.fr');
    expect(result).toEqual({ outcome: 'rejected', reason: 'off-domain-only' });
  });

  it('reports the own-domain named reason ahead of the less specific ones', () => {
    const result = discoverRoleContact(
      [homepage('jean@hotel-exemple.fr, contact@agence-web.fr, hotel@gmail.com')],
      'hotel-exemple.fr',
    );
    expect(result).toEqual({ outcome: 'rejected', reason: 'named-local-parts-only' });
  });

  it('is absent when the page publishes no address at all', () => {
    expect(discoverRoleContact([homepage('Bienvenue à l hôtel')], 'hotel-exemple.fr')).toEqual({
      outcome: 'absent',
      reason: 'no-address-published',
    });
  });

  it('is absent when there are no sources, which is what a JS-rendered footer looks like', () => {
    expect(discoverRoleContact([], 'hotel-exemple.fr')).toEqual({
      outcome: 'absent',
      reason: 'no-address-published',
    });
  });

  it.each([
    ['a filename that looks like an address', 'photo@2x.png'],
    ['a version string', 'node@22.1'],
  ])('does not report %s as a contact', (_label, text) => {
    const result = discoverRoleContact([homepage(text)], 'hotel-exemple.fr');
    expect(result.outcome).not.toBe('found');
  });

  it('rejects everything when the own domain cannot be parsed', () => {
    const result = discoverRoleContact([homepage('contact@hotel-exemple.fr')], 'localhost');
    expect(result).toEqual({ outcome: 'rejected', reason: 'off-domain-only' });
  });
});
