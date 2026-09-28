/**
 * Issue #546: the router's only cross-site check compares a request's Origin
 * with its own Host header. A page whose DNS name rebinds to 127.0.0.1 sends
 * both as its own name, so without a password (the loopback default) it could
 * read every `/api/*` answer and send JSON writes. Refusing any Host but a
 * loopback name or the deployment's configured public host, before routing,
 * closes that: a rebinding page cannot make the browser send someone else's
 * Host.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostnameOf(hostHeader: string): string | undefined {
  try {
    return new URL(`http://${hostHeader}`).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function isAllowedDashboardHost(
  hostHeader: string | undefined,
  publicHosts: readonly string[],
): boolean {
  if (hostHeader === undefined || hostHeader.trim() === '') return false;
  const hostname = hostnameOf(hostHeader.trim());
  if (hostname === undefined) return false;
  if (LOOPBACK_HOSTNAMES.has(hostname)) return true;
  return publicHosts.some((host) => hostnameOf(host.trim()) === hostname);
}
