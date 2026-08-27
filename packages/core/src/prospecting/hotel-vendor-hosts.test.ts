import { describe, expect, it } from 'vitest';
import {
  HOTEL_VENDOR_HOSTS,
  findHotelVendorHost,
  isHotelVendorHost,
} from './hotel-vendor-hosts.js';

describe('HOTEL_VENDOR_HOSTS', () => {
  it('holds every domain exactly once', () => {
    const domains = HOTEL_VENDOR_HOSTS.map((entry) => entry.domain);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it('stores domains already normalized, since lookup does not repair them', () => {
    for (const entry of HOTEL_VENDOR_HOSTS) {
      expect(entry.domain).toBe(entry.domain.toLowerCase().trim());
      expect(entry.domain.startsWith('www.')).toBe(false);
      expect(entry.domain).toContain('.');
    }
  });

  it('justifies every entry, which is the whole reason the field is required', () => {
    for (const entry of HOTEL_VENDOR_HOSTS) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });

  it('carries the site-builder hosts the public suffix list does not cover', () => {
    // The reason this list exists at all. Measured 2026-08-27: tldts parses
    // each of these to itself, so without an entry here the hotels on them
    // become a fabricated chain.
    for (const domain of [
      'business.site',
      'jimdo.com',
      'jimdofree.com',
      'jimdosite.com',
      'e-monsite.com',
      'webnode.fr',
      'eatbu.com',
    ]) {
      expect(isHotelVendorHost(domain)).toBe(true);
    }
  });

  it('classifies Logis as a federation, not a chain', () => {
    // 45 measured properties. Independent hotels sharing a marketing site is
    // exactly the case plan 002 step 5 forbids labelling as a chain.
    expect(findHotelVendorHost('logishotels.com')?.kind).toBe('federation');
  });
});

describe('findHotelVendorHost', () => {
  it('matches case-insensitively and tolerates surrounding whitespace', () => {
    expect(findHotelVendorHost('  Business.Site ')?.domain).toBe('business.site');
  });

  it('does not suffix-match, so a lookalike domain stays independent', () => {
    expect(isHotelVendorHost('notbooking.com')).toBe(false);
    expect(isHotelVendorHost('mybusiness.site')).toBe(false);
  });

  it('leaves an ordinary hotel domain alone', () => {
    expect(isHotelVendorHost('1924hotel.com')).toBe(false);
    expect(isHotelVendorHost('brithotel.fr')).toBe(false);
  });
});
