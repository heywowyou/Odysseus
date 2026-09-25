import { describe, expect, it } from 'vitest';
import { classifyCookie } from './classify-cookie.js';

describe('classifyCookie (issue #493)', () => {
  it('matches a distinctive prefix whatever the domain', () => {
    expect(classifyCookie({ name: '_ga_G-XYZ', domain: '.hotel.fr' })?.vendor).toBe(
      'Google Analytics',
    );
    expect(classifyCookie({ name: '_GA', domain: 'www.hotel.fr' })?.vendor).toBe(
      'Google Analytics',
    );
    expect(classifyCookie({ name: '_fbp', domain: '.hotel.fr' })?.vendor).toBe('Meta Pixel');
  });

  it('does not treat first-party names that start like a short vendor name as trackers', () => {
    expect(classifyCookie({ name: 'frontend', domain: '.hotel.fr' })).toBeUndefined();
    expect(classifyCookie({ name: 'frontend_cid', domain: 'www.hotel.fr' })).toBeUndefined();
    expect(classifyCookie({ name: 'fr_lang', domain: '.hotel.fr' })).toBeUndefined();
    expect(classifyCookie({ name: 'friendlycaptcha_solution', domain: '.hotel.fr' })).toBe(
      undefined,
    );
    expect(classifyCookie({ name: 'identity_token', domain: '.hotel.fr' })).toBeUndefined();
    expect(classifyCookie({ name: 'mp_session', domain: '.hotel.fr' })).toBeUndefined();
  });

  it('matches a short vendor name only on the vendor domain', () => {
    expect(classifyCookie({ name: 'fr', domain: '.hotel.fr' })).toBeUndefined();
    expect(classifyCookie({ name: 'fr', domain: '.facebook.com' })?.vendor).toBe('Meta');
    expect(classifyCookie({ name: 'IDE', domain: '.doubleclick.net' })?.vendor).toBe(
      'Google DoubleClick',
    );
    expect(classifyCookie({ name: 'ide', domain: '.hotel.fr' })).toBeUndefined();
    expect(classifyCookie({ name: 'MUID', domain: '.bing.com' })?.vendor).toBe(
      'Microsoft Advertising',
    );
    expect(classifyCookie({ name: 'bcookie', domain: '.www.linkedin.com' })?.vendor).toBe(
      'LinkedIn',
    );
    expect(classifyCookie({ name: 'lidc', domain: 'hotel.fr' })).toBeUndefined();
  });

  it('recognises Mixpanel only by its documented shape', () => {
    expect(
      classifyCookie({
        name: 'mp_0123456789abcdef0123456789abcdef_mixpanel',
        domain: '.hotel.fr',
      })?.vendor,
    ).toBe('Mixpanel');
  });

  it('does not classify a cookie whose purpose cannot be read from its name', () => {
    expect(classifyCookie({ name: 'PHPSESSID', domain: 'hotel.fr' })).toBeUndefined();
    expect(classifyCookie({ name: 'csrf_token', domain: 'hotel.fr' })).toBeUndefined();
    expect(classifyCookie({ name: 'wordpress_logged_in_abc', domain: 'hotel.fr' })).toBe(undefined);
  });
});
