import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import {
  detectVendor,
  detectFindingVendor,
  isConfinedToThirdParty,
  isConfinedToThirdPartyFrame,
  isThirdPartyFinding,
  summarizeThirdPartyFindings,
} from './third-party-attribution.js';

function findingWith(...selectors: string[]): Pick<Finding, 'elements'> {
  return {
    elements: selectors.map((selector) => ({
      pageUrl: 'https://example.com/',
      selector,
      snippet: '',
    })),
  };
}

describe('vendor attribution', () => {
  it('names a plugin, a consent banner and a booking-widget SDK', () => {
    expect(detectVendor('.gform_wrapper button')).toBe('Gravity Forms');
    expect(detectVendor('#cmplz-cookiebanner a')).toBe('Complianz');
    expect(detectVendor('.ZC_sdk__zc-iframe_k5FE3 >>> button')).toBe('ZenChef');
  });

  it('treats a shadow-piercing selector as third-party even with no named vendor', () => {
    expect(isThirdPartyFinding(findingWith('.some-widget >>> button'))).toBe(true);
    expect(detectFindingVendor(findingWith('.some-widget >>> button'))).toBeUndefined();
  });
});

describe('embedded players (issue #392)', () => {
  it('names YouTube player markup inside an embed', () => {
    const finding = findingWith(
      'iframe[frameborder="0"] >>> .ytmVideoInfoChannelAvatar',
      'iframe[frameborder="0"] >>> .ytmVideoInfoVideoTitle',
    );
    expect(detectFindingVendor(finding)).toBe('YouTube');
    expect(isConfinedToThirdParty(finding)).toBe(true);
    expect(detectVendor('.ytmenu > a')).toBeUndefined();
  });

  it('summarizes confined findings with their vendor and severity counts', () => {
    const embed = {
      findingId: 'f-1',
      severity: 'critical' as const,
      ...findingWith('iframe >>> .ytp-button'),
    };
    const frame = { findingId: 'f-2', severity: 'serious' as const, ...findingWith('.w >>> a') };
    const own = { findingId: 'f-3', severity: 'critical' as const, ...findingWith('nav > a') };
    expect(summarizeThirdPartyFindings([embed, frame, own])).toEqual({
      byFindingId: { 'f-1': { vendor: 'YouTube' }, 'f-2': { vendor: null } },
      severityRollup: { critical: 1, serious: 1, moderate: 0, minor: 0 },
    });
  });

  it('is confined only when every element is third-party', () => {
    expect(isConfinedToThirdParty(findingWith('iframe >>> .ytp-button', 'nav > a'))).toBe(false);
    expect(isConfinedToThirdParty(findingWith())).toBe(false);
  });
});

/**
 * Issue #299. Haaitza is built on its agency's own WordPress theme, and a
 * bare /diadao/ match filed that theme's navigation, header bar, booking
 * snippet panel and layout shifts under "your agency cannot modify this
 * code directly" - the exact opposite of true, since the agency wrote it.
 */
describe('an agency theme is the site, not a third party (issue #299)', () => {
  it('leaves the theme chrome first-party', () => {
    for (const selector of [
      'div#diadao-snippet-booking > div.snippet-inner > a#diadao-close-snippet',
      'div.container-hdp-bar-rooms > div#diadao-hdp-bar-mobile > a.diadao-button-book',
      'div#diadao-mainmenu > div.menu-panel > div.menu-buttons > a#diadao-mainmenu-close',
      'header#diadao-header > div.header-buttons > div.button-right > a.btn',
    ]) {
      expect(detectVendor(selector), selector).toBeUndefined();
      expect(isThirdPartyFinding(findingWith(selector)), selector).toBe(false);
    }
  });

  it('still names the vendor for the booking widget itself', () => {
    expect(detectVendor('#diadao-widget')).toBe('Diadao');
    expect(detectVendor('div.diadao-hsc-container > button')).toBe('Diadao');
  });

  it('never reads a theme path as a third-party component, whatever slug it carries', () => {
    // A plugin is a third party's release the agency would have to fork to
    // patch; a theme is what they are paid to maintain.
    expect(detectVendor('/wp-content/themes/gravity-theme/assets/hero.jpg')).toBeUndefined();
    expect(detectVendor('/wp-content/plugins/gravity-theme/style.css')).toBe('Gravity Forms');
  });
});

describe('grade exclusion is limited to embedded frames (plan 075, Q1)', () => {
  it('excludes a finding whose every element sits inside a frame', () => {
    expect(isConfinedToThirdPartyFrame(findingWith('iframe[width="560"] >>> .ytp-button'))).toBe(
      true,
    );
  });

  it('keeps an in-page vendor widget the site configured, such as a form plugin or consent banner', () => {
    expect(isConfinedToThirdPartyFrame(findingWith('.gform_wrapper input'))).toBe(false);
    expect(isConfinedToThirdPartyFrame(findingWith('#cmplz-cookiebanner a'))).toBe(false);
    expect(isConfinedToThirdParty(findingWith('.gform_wrapper input'))).toBe(true);
  });

  it('keeps a finding that also has first-party evidence, and an empty one', () => {
    expect(isConfinedToThirdPartyFrame(findingWith('iframe >>> .ytp-button', 'nav > a'))).toBe(
      false,
    );
    expect(isConfinedToThirdPartyFrame(findingWith())).toBe(false);
  });
});
