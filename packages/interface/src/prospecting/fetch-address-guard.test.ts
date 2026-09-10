import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROSPECT_FETCH_ALLOWLIST_ENV_VAR } from '../config.js';
import {
  checkFetchTarget,
  classifyIpAddress,
  type ResolvedAddress,
} from './fetch-address-guard.js';

const publicLookup = async (): Promise<readonly ResolvedAddress[]> => [
  { address: '93.184.216.34', family: 4 },
];

describe('classifyIpAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['::1', 'loopback'],
    ['0.0.0.0', 'unspecified'],
    ['::', 'unspecified'],
    ['10.0.0.1', 'private'],
    ['10.255.255.255', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.168.1.254', 'private'],
    ['100.64.0.1', 'private'],
    ['100.127.255.255', 'private'],
    ['169.254.0.1', 'link-local'],
    ['169.254.169.254', 'link-local'],
    ['fe80::1', 'link-local'],
    ['febf::1', 'link-local'],
    ['fc00::1', 'unique-local'],
    ['fd12:3456:789a::1', 'unique-local'],
    ['fdff::', 'unique-local'],
    ['::ffff:127.0.0.1', 'loopback'],
    ['::ffff:10.0.0.1', 'private'],
    ['::ffff:169.254.169.254', 'link-local'],
  ])('refuses %s as %s', (address, reason) => {
    expect(classifyIpAddress(address)).toEqual({ kind: 'refused', reason });
  });

  it.each([
    '8.8.8.8',
    '93.184.216.34',
    '172.32.0.1',
    '100.128.0.1',
    '11.0.0.1',
    '192.169.0.1',
    '2606:4700::1111',
    '2001:db8::1',
    '::ffff:8.8.8.8',
  ])('allows the public address %s', (address) => {
    expect(classifyIpAddress(address)).toEqual({ kind: 'allowed' });
  });

  it('refuses an address it cannot parse rather than passing it', () => {
    expect(classifyIpAddress('not-an-address')).toEqual({ kind: 'refused', reason: 'unparseable' });
    expect(classifyIpAddress('999.1.1.1')).toEqual({ kind: 'refused', reason: 'unparseable' });
  });
});

describe('checkFetchTarget', () => {
  const originalAllowlist = process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];

  beforeEach(() => {
    delete process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
  });

  afterEach(() => {
    if (originalAllowlist === undefined) delete process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR];
    else process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = originalAllowlist;
  });

  it('allows a host whose answers are all public', async () => {
    expect(
      await checkFetchTarget('https://example.fr/', { lookupAddresses: publicLookup }),
    ).toEqual({ kind: 'allowed' });
  });

  it('refuses when any answer is internal, even next to a public one', async () => {
    const verdict = await checkFetchTarget('https://example.fr/', {
      lookupAddresses: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '10.0.0.7', family: 4 },
      ],
    });
    expect(verdict).toEqual({
      kind: 'refused',
      detail: 'refused internal address 10.0.0.7 (private)',
    });
  });

  it('refuses loopback literals through the real resolver with no network', async () => {
    expect(await checkFetchTarget('http://127.0.0.1:4600/')).toEqual({
      kind: 'refused',
      detail: 'refused internal address 127.0.0.1 (loopback)',
    });
    expect(await checkFetchTarget('http://[::1]:4600/')).toEqual({
      kind: 'refused',
      detail: 'refused internal address ::1 (loopback)',
    });
  });

  it('refuses a url that does not parse', async () => {
    expect(await checkFetchTarget('not a url')).toEqual({
      kind: 'refused',
      detail: 'refused unparseable target url',
    });
  });

  it('refuses protocols fetch should not be pointed at anyway', async () => {
    expect(await checkFetchTarget('file:///etc/hostname')).toEqual({
      kind: 'refused',
      detail: 'refused non-http(s) url protocol file:',
    });
  });

  it('lets resolution errors reject so the helpers keep their existing failure path', async () => {
    const failure = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    await expect(
      checkFetchTarget('https://unresolved.invalid/', {
        lookupAddresses: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
  });

  describe('allowlist override', () => {
    const neverResolve = async (): Promise<readonly ResolvedAddress[]> => {
      throw new Error('an allowlisted host must not be resolved');
    };

    it('allows an exact host match without resolving it, wherever it points', async () => {
      process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = '127.0.0.1, Host.Example';
      expect(
        await checkFetchTarget('http://127.0.0.1:4600/', { lookupAddresses: neverResolve }),
      ).toEqual({ kind: 'allowed' });
      // Case-insensitive against the URL host, and the address check is
      // skipped for the entry: re-opening that hole is the operator's call.
      expect(
        await checkFetchTarget('http://HOST.EXAMPLE:8080/', {
          lookupAddresses: async () => [{ address: '10.1.2.3', family: 4 }],
        }),
      ).toEqual({ kind: 'allowed' });
    });

    it('matches a bracketed IPv6 literal entry against the bracketed url host', async () => {
      process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = '[::1]';
      expect(
        await checkFetchTarget('http://[::1]:4600/', { lookupAddresses: neverResolve }),
      ).toEqual({ kind: 'allowed' });
    });

    it('matches whole hosts only, never a neighbouring address', async () => {
      process.env[PROSPECT_FETCH_ALLOWLIST_ENV_VAR] = '127.0.0.10';
      // The near-miss entry does not whitelist the host, so the guard still
      // resolves and classifies (the injected answer is what gets judged).
      expect(
        await checkFetchTarget('http://127.0.0.1:4600/', {
          lookupAddresses: async () => [{ address: '10.9.9.9', family: 4 }],
        }),
      ).toEqual({
        kind: 'refused',
        detail: 'refused internal address 10.9.9.9 (private)',
      });
    });
  });
});
