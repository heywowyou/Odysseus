import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_SITE_NETWORK_POLICY } from './network-target-policy.js';
import {
  createPinnedDispatcher,
  fetchWithNetworkPolicy,
  NetworkSafetyBlockedError,
} from './safe-fetch.js';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 as const }];

describe('fetchWithNetworkPolicy', () => {
  it('checks a redirect target before fetching it', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
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

describe('createPinnedDispatcher', () => {
  it('refuses at connect time when the name answers privately to the socket lookup', async () => {
    const { createServer } = await import('node:http');
    const { fetch: undiciFetch } = await import('undici');
    const hits: string[] = [];
    const server = createServer((request, response) => {
      hits.push(request.url ?? '');
      response.end('private');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as import('node:net').AddressInfo).port;

    const blocked: string[] = [];
    const dispatcher = createPinnedDispatcher(PUBLIC_SITE_NETWORK_POLICY, {
      lookupAddresses: async () => [{ address: '127.0.0.1', family: 4 }],
      onBlocked: (disposition) => blocked.push(disposition.reason),
    });
    try {
      await expect(undiciFetch(`http://rebind.example:${port}/`, { dispatcher })).rejects.toThrow();
      expect(hits).toEqual([]);
      expect(blocked).toEqual(['refused-address']);
    } finally {
      await dispatcher.close();
      server.close();
    }
  });
});
