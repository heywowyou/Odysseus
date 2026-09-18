/**
 * Connection-time egress enforcement for Chromium (plan 059 sections 3.6, 5.2
 * and 7).
 *
 * `installBrowserNetworkSafety` checks a request's URL in a Playwright route
 * before Chromium continues it, and that check is worth keeping because it
 * records a disposition against the page that asked. It is not a boundary on
 * its own for two reasons. Chromium resolves the host again when it opens the
 * connection, so a name that answered publicly to our lookup can answer
 * privately to Chromium's (DNS rebinding). And a route only exists on a
 * Playwright context: Lighthouse drives its own target over the DevTools
 * protocol, so none of its traffic ever passes a route at all.
 *
 * This proxy closes both. Chromium is launched with every request, loopback
 * included, forced through it. The proxy resolves the host itself, refuses the
 * connection unless every answer is permitted by the policy, and then connects
 * to the exact address it classified. Nothing downstream re-resolves, so there
 * is no second answer to rebind to, and because the choke point is the browser
 * process rather than a context, Lighthouse, service workers and anything else
 * Chromium opens are covered by the same rule.
 */

import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import type { LookupAddresses, ResolvedAddress } from './address-guard.js';
import {
  checkNetworkTarget,
  type NetworkSafetyDisposition,
  type NetworkTargetPolicy,
} from './network-target-policy.js';

export interface EgressProxyOptions {
  policy: NetworkTargetPolicy;
  onBlocked?: (disposition: NetworkSafetyDisposition) => void;
  /** Test seam, forwarded to `checkNetworkTarget`. */
  lookupAddresses?: LookupAddresses;
}

export interface EgressProxy {
  port: number;
  /** Chromium flags that route all of the browser's traffic through this
   *  proxy, loopback included, and stop WebRTC from opening UDP paths that
   *  would not pass through it. */
  chromiumArgs: readonly string[];
  close(): Promise<void>;
}

/**
 * The address a connection must use. An allowlisted or test-only target was
 * never resolved by the policy, so it connects by name, which is exactly what
 * that policy permitted; every other target connects to the first classified
 * answer and nothing re-resolves it.
 */
function pickAddress(
  host: string,
  pinned: readonly ResolvedAddress[],
): { host: string; family?: number } {
  const first = pinned[0];
  if (first === undefined) return { host };
  return { host: first.address, family: first.family };
}

function stripBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function refuseSocket(socket: Duplex): void {
  socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}

/**
 * Starts the proxy on an ephemeral loopback port. The port is not reachable
 * from outside the host, and the proxy has no authentication because the only
 * client that can reach it is the Chromium this process launched.
 */
export async function startEgressProxy(options: EgressProxyOptions): Promise<EgressProxy> {
  const check = (url: string) =>
    checkNetworkTarget(url, options.policy, {
      ...(options.lookupAddresses !== undefined
        ? { lookupAddresses: options.lookupAddresses }
        : {}),
    });

  const server = http.createServer((request, response) => {
    void (async () => {
      const target = request.url ?? '';
      let parsed: URL;
      try {
        parsed = new URL(target);
      } catch {
        response.writeHead(400).end();
        return;
      }
      const verdict = await check(parsed.href);
      if (verdict.kind === 'refused') {
        options.onBlocked?.(verdict.disposition);
        response.writeHead(403).end();
        return;
      }
      const pinned = pickAddress(stripBrackets(parsed.hostname), verdict.pinnedAddresses);
      const upstream = http.request(
        {
          protocol: 'http:',
          // The only address the connection may use is the one classified
          // above; the resolver is not consulted a second time. The Host
          // header still names the site, from the forwarded headers.
          host: pinned.host,
          ...(pinned.family !== undefined ? { family: pinned.family } : {}),
          port: parsed.port === '' ? 80 : Number(parsed.port),
          method: request.method,
          path: `${parsed.pathname}${parsed.search}`,
          headers: request.headers,
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        },
      );
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502);
        response.end();
      });
      request.pipe(upstream);
    })();
  });

  server.on('connect', (request, clientSocket, head) => {
    void (async () => {
      const authority = request.url ?? '';
      const separator = authority.lastIndexOf(':');
      const host = stripBrackets(separator === -1 ? authority : authority.slice(0, separator));
      const port = separator === -1 ? 443 : Number(authority.slice(separator + 1));
      if (host === '' || !Number.isInteger(port) || port <= 0 || port > 65_535) {
        refuseSocket(clientSocket);
        return;
      }
      // CONNECT carries no scheme. `https:` is what a tunnel is for, and the
      // scheme only matters to the policy's http(s)-only rule, which a tunnel
      // to a TLS port satisfies.
      const displayHost = net.isIPv6(host) ? `[${host}]` : host;
      const verdict = await check(`https://${displayHost}:${port}/`);
      if (verdict.kind === 'refused') {
        options.onBlocked?.(verdict.disposition);
        refuseSocket(clientSocket);
        return;
      }
      const pinned = pickAddress(host, verdict.pinnedAddresses);
      const upstream = net.connect({
        host: pinned.host,
        port,
        ...(pinned.family !== undefined ? { family: pinned.family } : {}),
      });
      upstream.once('connect', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length > 0) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.on('error', () => clientSocket.destroy());
      clientSocket.on('error', () => upstream.destroy());
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('startEgressProxy: could not determine the listening port');
  }

  return {
    port: address.port,
    chromiumArgs: [
      `--proxy-server=http://127.0.0.1:${address.port}`,
      // Chromium bypasses a proxy for loopback by default. The subtraction
      // rule removes that implicit bypass, so a page cannot reach the host's
      // own services by naming localhost.
      '--proxy-bypass-list=<-loopback>',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ],
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
