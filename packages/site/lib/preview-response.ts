/**
 * What the preview route answers, milestone 9c plan 009.
 *
 * Kept as a plain function returning a status, a body and headers, with the
 * route handler a shell around it. That is not ceremony: `packages/site` has no
 * React testing setup and the workspace's Vitest configuration collects plain
 * `.ts` files in a Node environment, so this shape is what lets every status,
 * every header and the expiry boundary be tested at all without adding a test
 * dependency to a marketing site.
 *
 * Three answers, and the distinction between them is deliberate:
 *
 * - **404** for a malformed token, an unknown one, and a revoked one alike.
 *   Telling them apart would confirm to somebody guessing that a token was well
 *   formed, and would tell anyone holding a withdrawn link that it once worked.
 * - **410** for a preview that existed and has passed its public lifetime. The
 *   recipient was promised thirty days; "this expired" is a true and useful
 *   answer, and it is the one case where saying more than "no" is right.
 * - **200** with the stored document byte for byte. It is already validated and
 *   linted by the time it reaches the bucket; nothing here rewrites it.
 */

import { objectKeyForToken } from './preview-object';
import type { PreviewReader } from './read-preview';

export interface PreviewResponse {
  status: 200 | 404 | 410;
  body: string;
  headers: Record<string, string>;
}

const NOT_FOUND_BODY = 'Aperçu introuvable ou retiré. / Preview not found or withdrawn.';
const GONE_BODY = 'Cet aperçu a expiré. / This preview has expired.';

/**
 * Security headers for a document that is a self-contained page of inline CSS
 * and data-URI PNGs with no script of any kind - which is what plan 008
 * produces, so this policy is a description of the document rather than a
 * restriction imposed on it.
 *
 * `style-src 'unsafe-inline'` is required because the stylesheet is inlined;
 * with `default-src 'none'` and no script source at all, it grants nothing an
 * attacker could use. `no-store` because a preview must not outlive its own
 * expiry in a shared cache, and `no-referrer` because the URL *is* the
 * credential and must not travel to any site the reader clicks through to.
 */
export const PREVIEW_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'text/html; charset=utf-8',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'cache-control': 'private, no-store, max-age=0, must-revalidate',
  'referrer-policy': 'no-referrer',
  'content-security-policy':
    "default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; " +
    "form-action 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
};

function refuse(status: 404 | 410, body: string): PreviewResponse {
  return { status, body, headers: { ...PREVIEW_SECURITY_HEADERS } };
}

export async function resolvePreviewResponse(options: {
  token: string;
  reader: PreviewReader;
  now?: Date;
}): Promise<PreviewResponse> {
  const objectKey = objectKeyForToken(options.token);
  if (objectKey === null) return refuse(404, NOT_FOUND_BODY);

  const stored = await options.reader.read(objectKey);
  if (stored === null) return refuse(404, NOT_FOUND_BODY);

  const now = options.now ?? new Date();
  // Inclusive: at the instant it expires, it is expired.
  if (stored.publicExpiresAt.getTime() <= now.getTime()) return refuse(410, GONE_BODY);

  return { status: 200, body: stored.html, headers: { ...PREVIEW_SECURITY_HEADERS } };
}
