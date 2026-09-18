import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_SITE_NETWORK_POLICY } from './network-target-policy.js';
import { fetchWithNetworkPolicy, NetworkSafetyBlockedError } from './safe-fetch.js';

const publicLookup = async () => [{ address: '203.0.113.10', family: 4 as const }];

describe('fetchWithNetworkPolicy', () => {
  it('checks a redirect target before fetching it', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'http://127.0.0.1/private' },
        }),
      );

    const blocked: string[] = [];
    await expect(
      fetchWithNetworkPolicy(
        'https://public.example/start',
        {},
        {
          policy: PUBLIC_SITE_NETWORK_POLICY,
          lookupAddresses: publicLookup,
          fetchImpl,
          onBlocked: (disposition) => blocked.push(disposition.reason),
        },
      ),
    ).rejects.toBeInstanceOf(NetworkSafetyBlockedError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(blocked).toEqual(['refused-address']);
  });

  it('follows a bounded public redirect chain with manual redirects', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: '/next' },
        }),
      )
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const response = await fetchWithNetworkPolicy(
      'https://public.example/start',
      {},
      {
        policy: PUBLIC_SITE_NETWORK_POLICY,
        lookupAddresses: publicLookup,
        fetchImpl,
      },
    );

    expect(await response.text()).toBe('ok');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://public.example/start',
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://public.example/next',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });
});
