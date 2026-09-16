import type { IncomingMessage, ServerResponse } from 'node:http';

/** CSP for the SPA shell HTML. style-src allows inline styles because the
 *  sandboxed srcDoc preview iframe (dashboard/routes/hub-preview-section.tsx)
 *  inherits this policy and the outreach preview HTML embeds an inline
 *  <style> block (report/outreach-preview/render-html.ts). img-src allows
 *  data: for inline images. */
export const SPA_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/** One year, the common preload-list minimum. No includeSubDomains: the
 *  dashboard host has no subdomains of its own, and the directive would say
 *  nothing about the sibling public site on another host. */
export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000';

/** Caddy terminates TLS and forwards X-Forwarded-Proto, so "arrived over
 *  https" is exactly that header; plain-HTTP local traffic lacks it. */
export function requestArrivedOverHttps(req: IncomingMessage): boolean {
  return req.headers['x-forwarded-proto'] === 'https';
}

/** Baseline headers for every response this origin sends, whatever the
 *  content type: JSON, HTML, PDF, redirects, and errors. Modeled on the
 *  pattern prospect-insights.ts already uses for its PNG evidence route.
 *  HSTS is sent only on a response to an HTTPS request: browsers ignore it
 *  over plain HTTP, and a local plain-HTTP run must not pin itself to TLS. */
export function applyBaseSecurityHeaders(res: ServerResponse, req: IncomingMessage): void {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  if (requestArrivedOverHttps(req)) {
    res.setHeader('strict-transport-security', STRICT_TRANSPORT_SECURITY);
  }
}

/** True when the static fallback is serving the SPA shell (HTML), which is
 *  the only response that should carry the CSP. */
export function isHtmlContentType(contentType: string): boolean {
  return contentType.startsWith('text/html');
}
