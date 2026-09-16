import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import {
  contactRemovalConfirm,
  contactRemovalRequest,
  stakeholderFromInput,
  stakeholdersAfterChange,
} from './prospect-contact-model';

describe('contactRemovalConfirm', () => {
  it('warns that removing the primary website promotes the next one', () => {
    const copy = fr.prospectHub.detail.contacts;
    const primary = contactRemovalConfirm(
      { kind: 'website', url: 'https://a.fr/', primary: true },
      copy,
    );
    expect(primary.description).toContain('https://a.fr/');
    expect(primary.description).toContain(copy.removeWebsitePrimaryNote);
    const secondary = contactRemovalConfirm(
      { kind: 'website', url: 'https://b.fr/', primary: false },
      copy,
    );
    expect(secondary.description).not.toContain(copy.removeWebsitePrimaryNote);
  });

  it('distinguishes a plain removal from remove-and-block', () => {
    const copy = en.prospectHub.detail.contacts;
    expect(
      contactRemovalConfirm({ kind: 'email', address: 'x@a.fr', blacklist: false }, copy)
        .confirmLabel,
    ).toBe('Remove');
    const blocked = contactRemovalConfirm(
      { kind: 'email', address: 'x@a.fr', blacklist: true },
      copy,
    );
    expect(blocked.confirmLabel).toBe('Remove and block');
    expect(blocked.description).toContain('x@a.fr');
  });
});

describe('contactRemovalRequest', () => {
  it('targets the explicit endpoints and only asks for suppression when blocking', () => {
    expect(
      contactRemovalRequest('p1', { kind: 'website', url: 'https://a.fr/', primary: false }),
    ).toEqual({
      path: '/api/prospects/p1/websites',
      body: { url: 'https://a.fr/' },
    });
    expect(
      contactRemovalRequest('p1', { kind: 'email', address: 'x@a.fr', blacklist: false }).body,
    ).toEqual({ address: 'x@a.fr' });
    expect(
      contactRemovalRequest('p1', { kind: 'email', address: 'x@a.fr', blacklist: true }).body,
    ).toEqual({
      address: 'x@a.fr',
      suppress: true,
    });
  });
});

describe('stakeholderFromInput', () => {
  it('trims both values and leaves out an empty position', () => {
    expect(stakeholderFromInput(' Jeanne Dupont ', ' Directrice ')).toEqual({
      name: 'Jeanne Dupont',
      position: 'Directrice',
    });
    expect(stakeholderFromInput('Sam Martin', '   ')).toEqual({ name: 'Sam Martin' });
  });

  it('refuses a blank name', () => {
    expect(stakeholderFromInput('  ', 'Directrice')).toBeNull();
  });
});

describe('stakeholdersAfterChange', () => {
  const list = [{ name: 'Jeanne Dupont', position: 'Directrice' }, { name: 'Sam Martin' }];

  it('appends, replaces, and removes by position', () => {
    expect(stakeholdersAfterChange(list, undefined, { name: 'Léa Roux' })).toEqual([
      ...list,
      { name: 'Léa Roux' },
    ]);
    expect(stakeholdersAfterChange(list, 1, { name: 'Sam Martin', position: 'IT' })).toEqual([
      list[0],
      { name: 'Sam Martin', position: 'IT' },
    ]);
    expect(stakeholdersAfterChange(list, 0, null)).toEqual([list[1]]);
  });
});
