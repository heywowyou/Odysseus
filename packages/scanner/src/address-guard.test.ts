/**
 * Covers the ranges and spellings plan 059 section 5.2 added to the shared
 * classifier. The broader public/private matrix is exercised by
 * `packages/interface/src/prospecting/fetch-address-guard.test.ts`, which
 * pins the posture both packages share; this file is about the forms that
 * previously walked past it.
 */

import { describe, expect, it } from 'vitest';
import { classifyIpAddress } from './address-guard.js';

describe('multicast and reserved ranges', () => {
  it.each([
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['ff02::1', 'multicast'],
    ['ff00::', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'reserved'],
  ])('refuses %s as %s', (address, reason) => {
    expect(classifyIpAddress(address)).toEqual({ kind: 'refused', reason });
  });

  it('still allows the public address just below the multicast boundary', () => {
    expect(classifyIpAddress('223.255.255.255')).toEqual({ kind: 'allowed' });
  });
});

describe('IPv6 spellings that embed an IPv4 address', () => {
  it.each([
    // ::/96 IPv4-compatible.
    ['::127.0.0.1', 'loopback'],
    ['::10.0.0.1', 'private'],
    ['::169.254.169.254', 'link-local'],
    // 64:ff9b::/96 NAT64.
    ['64:ff9b::127.0.0.1', 'loopback'],
    ['64:ff9b::192.168.1.1', 'private'],
    ['64:ff9b::169.254.169.254', 'link-local'],
    // 2002::/16 6to4, embedded address in the second and third hextets.
    ['2002:7f00:0001::', 'loopback'],
    ['2002:c0a8:0101::', 'private'],
    ['2002:a9fe:a9fe::', 'link-local'],
  ])('refuses %s, reaching the same host as its dotted-quad form, as %s', (address, reason) => {
    expect(classifyIpAddress(address)).toEqual({ kind: 'refused', reason });
  });

  it.each(['::8.8.8.8', '64:ff9b::8.8.8.8', '2002:0808:0808::'])(
    'allows %s, whose embedded address is genuinely public',
    (address) => {
      expect(classifyIpAddress(address)).toEqual({ kind: 'allowed' });
    },
  );

  it('keeps the unspecified and loopback literals classified as themselves', () => {
    expect(classifyIpAddress('::')).toEqual({ kind: 'refused', reason: 'unspecified' });
    expect(classifyIpAddress('::1')).toEqual({ kind: 'refused', reason: 'loopback' });
  });

  it('refuses ::2, which is 0.0.0.2 and so lands in "this network"', () => {
    expect(classifyIpAddress('::2')).toEqual({ kind: 'refused', reason: 'unspecified' });
  });
});
