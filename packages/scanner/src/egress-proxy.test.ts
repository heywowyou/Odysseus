import http from 'node:http';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startEgressProxy, type EgressProxy } from './egress-proxy.js';
import {
  createTestOnlyLoopbackPolicy,
  PUBLIC_SITE_NETWORK_POLICY,
  type NetworkSafetyDisposition,
} from './network-target-policy.js';

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
});

async function startUpstream(): Promise<{ port: number; hits: string[] }> {
  const hits: string[] = [];
  const server = http.createServer((request, response) => {
    hits.push(request.url ?? '');
    response.end('upstream');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  closers.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return { port: (server.address() as net.AddressInfo).port, hits };
}

async function startProxy(options: Parameters<typeof startEgressProxy>[0]): Promise<EgressProxy> {
  const proxy = await startEgressProxy(options);
  closers.push(() => proxy.close());
  return proxy;
}

function proxiedGet(proxyPort: number, target: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: '127.0.0.1', port: proxyPort, method: 'GET', path: target },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => (body += chunk));
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      },
    );
    request.on('error', reject);
    request.end();
  });
}

function connectThrough(proxyPort: number, authority: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, '127.0.0.1', () => {
      socket.write(`CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n\r\n`);
    });
    let received = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      received += chunk;
      if (received.includes('\r\n\r\n')) {
        socket.destroy();
        resolve(received.split('\r\n')[0]!);
      }
    });
    socket.on('error', reject);
    socket.on('end', () => resolve(received.split('\r\n')[0] ?? ''));
  });
}

describe('startEgressProxy', () => {
  it('refuses a loopback target under the public-site policy without dialling it', async () => {
    const upstream = await startUpstream();
    const blocked: NetworkSafetyDisposition[] = [];
    const proxy = await startProxy({
      policy: PUBLIC_SITE_NETWORK_POLICY,
      onBlocked: (disposition) => blocked.push(disposition),
    });

    const result = await proxiedGet(proxy.port, `http://127.0.0.1:${upstream.port}/secret`);

    expect(result.status).toBe(403);
    expect(upstream.hits).toEqual([]);
    expect(blocked.map((entry) => entry.reason)).toEqual(['refused-address']);
  });

  it('refuses a tunnel to a name that resolves to a private address', async () => {
    const blocked: NetworkSafetyDisposition[] = [];
    const proxy = await startProxy({
      policy: PUBLIC_SITE_NETWORK_POLICY,
      lookupAddresses: async () => [{ address: '10.0.0.7', family: 4 }],
      onBlocked: (disposition) => blocked.push(disposition),
    });

    const statusLine = await connectThrough(proxy.port, 'rebind.example:443');

    expect(statusLine).toBe('HTTP/1.1 403 Forbidden');
    expect(blocked[0]).toMatchObject({ reason: 'refused-address', address: '10.0.0.7' });
  });

  it('refuses a tunnel when any answer in the set is private', async () => {
    const proxy = await startProxy({
      policy: PUBLIC_SITE_NETWORK_POLICY,
      lookupAddresses: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '169.254.169.254', family: 4 },
      ],
    });

    expect(await connectThrough(proxy.port, 'mixed.example:443')).toBe('HTTP/1.1 403 Forbidden');
  });

  it('forwards requests and tunnels a policy permits', async () => {
    const upstream = await startUpstream();
    const proxy = await startProxy({ policy: createTestOnlyLoopbackPolicy() });

    const result = await proxiedGet(proxy.port, `http://127.0.0.1:${upstream.port}/page?x=1`);
    expect(result).toEqual({ status: 200, body: 'upstream' });
    expect(upstream.hits).toEqual(['/page?x=1']);

    expect(await connectThrough(proxy.port, `127.0.0.1:${upstream.port}`)).toBe(
      'HTTP/1.1 200 Connection Established',
    );
  });

  it('forces loopback through the proxy in the Chromium flags', async () => {
    const proxy = await startProxy({ policy: PUBLIC_SITE_NETWORK_POLICY });

    expect(proxy.chromiumArgs).toContain(`--proxy-server=http://127.0.0.1:${proxy.port}`);
    expect(proxy.chromiumArgs).toContain('--proxy-bypass-list=<-loopback>');
  });
});
