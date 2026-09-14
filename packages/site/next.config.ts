import type { NextConfig } from 'next';

/**
 * Issue #213 item 3: the self-audit found the public homepage response
 * missing a Content-Security-Policy, frame protection, Permissions-Policy
 * and Referrer-Policy entirely. `/apercu/[token]` already sets its own,
 * much stricter, no-script CSP for the stored preview document (see
 * lib/preview-response.ts) - that policy is not reusable here, since these
 * marketing pages need script-src/style-src for Next's own hydration and
 * Tailwind, which the preview document has neither of. The two policies
 * are kept deliberately separate rather than shared, and the marketing
 * policy below is scoped to exclude /apercu/* so the two never collide.
 *
 * No nonces: nonces require every page to render dynamically (see
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md),
 * which would undo the static generation this marketing site relies on for
 * performance. `'unsafe-inline'` on script-src and style-src is the
 * documented "Without Nonces" pattern in that same guide, and is what lets
 * Next's own inline RSC flight-data scripts and the JSON-LD block below
 * run without weakening any other directive (object-src, base-uri,
 * form-action and frame-ancestors all stay locked down).
 */
const marketingCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Every route except the token-gated preview document, which sets
        // its own headers explicitly in app/apercu/[token]/route.ts.
        source: '/((?!apercu).*)',
        headers: [
          { key: 'Content-Security-Policy', value: marketingCsp },
          // Superseded by CSP's frame-ancestors for modern browsers, kept
          // as an explicit fallback per the issue's own wording.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
