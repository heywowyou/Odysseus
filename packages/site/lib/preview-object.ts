/**
 * Token validation, hashing and object-key derivation for the public preview
 * route, milestone 9c plan 009.
 *
 * This is a deliberate copy of `packages/interface/src/outreach/
 * preview-token.ts`. The public site is walled off from the private audit
 * engine on purpose - that wall is what makes it impossible for a bug on a
 * marketing page to reach the database - and importing a private workspace
 * package to save forty lines would be the first hole in it.
 *
 * The copies are kept honest by `fixtures/outreach-preview-keys.json`, which
 * pins tokens to their hashes and keys and is asserted from both packages. If
 * one side's derivation changes, the other side's test goes red rather than the
 * two quietly disagreeing about which object a link points at.
 */

import { createHash } from 'node:crypto';

const PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

const PREVIEW_OBJECT_PREFIX = 'previews/';

export function isValidPreviewToken(token: string): boolean {
  return PREVIEW_TOKEN_PATTERN.test(token);
}

/** Validated before it is hashed, so an arbitrary path segment never becomes a
 *  well-formed lookup against the bucket. */
export function hashPreviewToken(token: string): string {
  if (!isValidPreviewToken(token)) {
    throw new Error('preview token is malformed');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function deriveObjectKey(tokenHash: string): string {
  if (!/^[0-9a-f]{64}$/u.test(tokenHash)) {
    throw new Error('preview token hash is malformed');
  }
  return `${PREVIEW_OBJECT_PREFIX}${tokenHash}.html`;
}

/** The key a request path maps to, or null when the path could never name one.
 *  Returning null rather than throwing is what lets the route answer 404 for a
 *  malformed token and an unknown one identically, which is the point: telling
 *  the two apart would confirm to a guesser that a token was well formed. */
export function objectKeyForToken(token: string): string | null {
  if (!isValidPreviewToken(token)) return null;
  return deriveObjectKey(hashPreviewToken(token));
}
