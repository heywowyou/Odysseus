/**
 * Opaque preview tokens, milestone 9c plan 009.
 *
 * A preview link is the only thing standing between a stranger and one hotel's
 * evidence, so the token is the access control: 32 random bytes, never derived
 * from the domain, the candidate id or anything else guessable. The raw token
 * exists twice - once in the operator's hand at publication, once in the URL
 * the recipient holds - and nowhere else. Only its SHA-256 is written down, and
 * the object key is derived from that hash, so an attacker who somehow reads
 * both the database and the bucket listing still cannot construct a URL.
 *
 * `packages/site/lib/preview-object.ts` holds a deliberate copy of the syntax
 * check, the hash and the key derivation, because the public site must not
 * import a private workspace package. `fixtures/outreach-preview-keys.json`
 * pins the three of them and is asserted from both packages, so the copies
 * cannot drift apart in silence.
 */

import { createHash, randomBytes } from 'node:crypto';

/** 32 bytes, which base64url encodes to 43 characters with no padding. */
const PREVIEW_TOKEN_BYTES = 32;

/** Anchored, and length-exact: a token is validated before it is hashed, so a
 *  malformed path never reaches the bucket as a lookup. */
export const PREVIEW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export const PREVIEW_OBJECT_PREFIX = 'previews/';

export function createPreviewToken(): string {
  return randomBytes(PREVIEW_TOKEN_BYTES).toString('base64url');
}

export function isValidPreviewToken(token: string): boolean {
  return PREVIEW_TOKEN_PATTERN.test(token);
}

/**
 * Throws rather than returning a hash for a malformed token. A caller that
 * skipped the syntax check would otherwise get a well-formed hash for arbitrary
 * path input, which is exactly the lookup we do not want to perform.
 */
export function hashPreviewToken(token: string): string {
  if (!isValidPreviewToken(token)) {
    throw new Error('preview token is malformed');
  }
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** The bucket key for a token hash. Hash in, key out: the raw token is never
 *  part of a key, so bucket access logs cannot leak a working URL. */
export function deriveObjectKey(tokenHash: string): string {
  if (!/^[0-9a-f]{64}$/u.test(tokenHash)) {
    throw new Error('preview token hash is malformed');
  }
  return `${PREVIEW_OBJECT_PREFIX}${tokenHash}.html`;
}
