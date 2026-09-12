import type { ServerResponse } from 'node:http';

/** CSP for the SPA shell HTML. style-src allows inline styles because the
 *  sandboxed srcDoc preview iframe (dashboard/routes/hub-preview-section.tsx)
 *  inherits this policy and the outreach preview HTML embeds an inline
 *  <style> block (report/outreach-preview/render-html.ts). img-src allows
 *  data: for the shell's data: favicon. */
export const SPA_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

/** Baseline headers for every response this origin sends, whatever the
 *  content type: JSON, HTML, PDF, redirects, and errors. Modeled on the
 *  pattern prospect-insights.ts already uses for its PNG evidence route. */
export function applyBaseSecurityHeaders(res: ServerResponse): void {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
}

/** True when the static fallback is serving the SPA shell (HTML), which is
 *  the only response that should carry the CSP. */
export function isHtmlContentType(contentType: string): boolean {
  return contentType.startsWith('text/html');
}
