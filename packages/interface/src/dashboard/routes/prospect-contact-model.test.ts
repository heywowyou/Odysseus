import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { contactRemovalConfirm, contactRemovalRequest } from './prospect-contact-model';

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
