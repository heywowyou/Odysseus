import { describe, expect, it } from 'vitest';
import type { ResolvedAddress } from './address-guard.js';
import {
  assertPinnedAddress,
  checkNetworkTarget,
  checkRedirectTarget,
  createTestOnlyLoopbackPolicy,
  PUBLIC_SITE_NETWORK_POLICY,
  PUBLIC_SITE_NETWORK_POLICY_ID,
  resolveNetworkTargetPolicyForJob,
  TEST_ONLY_LOOPBACK_NETWORK_POLICY_ID,
} from './network-target-policy.js';

function resolvesTo(...addresses: string[]) {
  return async (): Promise<readonly ResolvedAddress[]> =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
}

const publicLookup = resolvesTo('93.184.216.34');

describe('policy selection', () => {
  it('gives job input the public-site policy when it names nothing', () => {
    expect(resolveNetworkTargetPolicyForJob()).toBe(PUBLIC_SITE_NETWORK_POLICY);
    expect(resolveNetworkTargetPolicyForJob(PUBLIC_SITE_NETWORK_POLICY_ID)).toBe(
      PUBLIC_SITE_NETWORK_POLICY,
    );
  });

  it('refuses a job that asks for the loopback profile instead of quietly downgrading it', () => {
    expect(() => resolveNetworkTargetPolicyForJob(TEST_ONLY_LOOPBACK_NETWORK_POLICY_ID)).toThrow(
      /may only select public-site/u,
    );
    expect(() => resolveNetworkTargetPolicyForJob('anything-else')).toThrow(/may only select/u);
  });

  it('builds the loopback profile under a test runner', () => {
    const policy = createTestOnlyLoopbackPolicy();
    expect(policy.id).toBe(TEST_ONLY_LOOPBACK_NETWORK_POLICY_ID);
    expect(policy.allowsPrivateAddresses).toBe(true);
  });
});

describe('target checks under the public-site policy', () => {
  it('allows a public host and hands back the addresses it classified', async () => {
    const verdict = await checkNetworkTarget(
      'https://hotel-exemple.fr/',
      PUBLIC_SITE_NETWORK_POLICY,
      {
        lookupAddresses: publicLookup,
      },
    );

    expect(verdict.kind).toBe('allowed');
    if (verdict.kind !== 'allowed') return;
    expect(verdict.pinnedAddresses).toEqual([{ address: '93.184.216.34', family: 4 }]);
  });

  it.each([
    ['https://localhost/', '127.0.0.1', 'loopback'],
    ['https://intranet.example/', '10.1.2.3', 'private'],
    ['https://metadata.example/', '169.254.169.254', 'link-local'],
    ['https://v6.example/', '::1', 'loopback'],
    ['https://v6.example/', 'fe80::1', 'link-local'],
    ['https://v6.example/', 'fd00::1', 'unique-local'],
    ['https://mapped.example/', '::ffff:127.0.0.1', 'loopback'],
    ['https://tunnel.example/', '2002:7f00:0001::', 'loopback'],
  ])('refuses %s when it resolves to %s', async (url, address, addressReason) => {
    const verdict = await checkNetworkTarget(url, PUBLIC_SITE_NETWORK_POLICY, {
      lookupAddresses: resolvesTo(address),
    });

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.disposition.reason).toBe('refused-address');
    expect(verdict.disposition.addressReason).toBe(addressReason);
    expect(verdict.disposition.retryable).toBe(false);
  });

  it('refuses an answer set that mixes a public address with an internal one', async () => {
    const verdict = await checkNetworkTarget('https://split.example/', PUBLIC_SITE_NETWORK_POLICY, {
      lookupAddresses: resolvesTo('93.184.216.34', '10.0.0.5'),
    });

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.disposition.address).toBe('10.0.0.5');
  });

  it.each([
    ['not a url', 'unparseable-url'],
    ['file:///etc/passwd', 'forbidden-scheme'],
    ['javascript:alert(1)', 'forbidden-scheme'],
    ['https://user:pass@hotel-exemple.fr/', 'credentials-in-url'],
  ])('refuses %s as %s before any lookup', async (url, reason) => {
    const verdict = await checkNetworkTarget(url, PUBLIC_SITE_NETWORK_POLICY, {
      lookupAddresses: () => {
        throw new Error('the guard must not resolve a target it already refused');
      },
    });

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.disposition.reason).toBe(reason);
  });

  it('records an unresolvable host as its own disposition rather than throwing', async () => {
    const verdict = await checkNetworkTarget('https://gone.example/', PUBLIC_SITE_NETWORK_POLICY, {
      lookupAddresses: () => Promise.reject(new Error('ENOTFOUND')),
    });

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.disposition.reason).toBe('unresolvable-host');
  });
});

describe('redirect hops', () => {
  it('refuses a public URL whose redirect lands on a private address', async () => {
    const first = await checkNetworkTarget(
      'https://public.example/go',
      PUBLIC_SITE_NETWORK_POLICY,
      {
        lookupAddresses: publicLookup,
      },
    );
    expect(first.kind).toBe('allowed');

    const hop = await checkRedirectTarget(
      'https://public.example/internal',
      PUBLIC_SITE_NETWORK_POLICY,
      { lookupAddresses: resolvesTo('169.254.169.254') },
    );

    expect(hop.kind).toBe('refused');
    if (hop.kind !== 'refused') return;
    expect(hop.disposition.addressReason).toBe('link-local');
  });
});

describe('address pinning', () => {
  it('accepts a connection that reached one of the checked addresses', () => {
    const verdict = assertPinnedAddress(
      'https://hotel-exemple.fr/',
      PUBLIC_SITE_NETWORK_POLICY,
      '93.184.216.34',
      [{ address: '93.184.216.34', family: 4 }],
    );

    expect(verdict.kind).toBe('allowed');
  });

  it('catches a rebind that answered with an internal address after the check passed', () => {
    const verdict = assertPinnedAddress(
      'https://rebind.example/',
      PUBLIC_SITE_NETWORK_POLICY,
      '127.0.0.1',
      [{ address: '93.184.216.34', family: 4 }],
    );

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.disposition.reason).toBe('rebound-address');
    expect(verdict.disposition.addressReason).toBe('loopback');
    expect(verdict.disposition.retryable).toBe(false);
  });

  it('catches a rebind to a different public address, which is still not what was checked', () => {
    const verdict = assertPinnedAddress(
      'https://rebind.example/',
      PUBLIC_SITE_NETWORK_POLICY,
      '8.8.8.8',
      [{ address: '93.184.216.34', family: 4 }],
    );

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.disposition.reason).toBe('rebound-address');
    expect(verdict.disposition.addressReason).toBeUndefined();
  });
});

describe('the loopback profile', () => {
  it('allows the fixture host the public-site policy would refuse', async () => {
    const policy = createTestOnlyLoopbackPolicy();
    const verdict = await checkNetworkTarget('http://127.0.0.1:8080/', policy, {
      lookupAddresses: resolvesTo('127.0.0.1'),
    });

    expect(verdict.kind).toBe('allowed');
  });

  it('still refuses a forbidden scheme, which no profile makes safe', async () => {
    const policy = createTestOnlyLoopbackPolicy();
    const verdict = await checkNetworkTarget('file:///etc/passwd', policy);

    expect(verdict.kind).toBe('refused');
    if (verdict.kind !== 'refused') return;
    expect(verdict.disposition.reason).toBe('forbidden-scheme');
  });
});
