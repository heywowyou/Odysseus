import { scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/** Default node:crypto scrypt parameters with the key length the only knob
 *  spelled out: scripts/hash-dashboard-password.mjs (plain .mjs, no imports
 *  from this package) and this verifier must agree on the exact recipe, so
 *  neither may tune a parameter the other does not know about. */
export const SCRYPT_KEY_LENGTH_BYTES = 64;

/** promisify cannot infer a return type through scrypt's overloaded
 *  callbacks, so the three-argument shape is spelled out once here. */
const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keyLength: number,
) => Promise<Buffer>;

export interface ParsedDashboardPasswordHash {
  salt: Buffer;
  expectedHash: Buffer;
}

/** Splits the configured `salt:hash` value into its binary halves. Anything
 *  but two non-empty, even-length hex segments returns null, so a mistyped
 *  environment value fails closed here instead of throwing mid-request. */
export function parseDashboardPasswordHash(configured: string): ParsedDashboardPasswordHash | null {
  const separator = configured.indexOf(':');
  if (separator <= 0) return null;
  const saltHex = configured.slice(0, separator);
  const hashHex = configured.slice(separator + 1);
  if (!isEvenLengthHex(saltHex) || !isEvenLengthHex(hashHex)) return null;
  return {
    salt: Buffer.from(saltHex, 'hex'),
    expectedHash: Buffer.from(hashHex, 'hex'),
  };
}

function isEvenLengthHex(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value);
}

/** Constant-time check of a login password against the configured hash.
 *  Never throws: any malformed configuration verifies false, so the login
 *  route can only answer 401 on a bad env var, never 500. */
export async function verifyDashboardPassword(
  configured: string,
  password: string,
): Promise<boolean> {
  try {
    const parsed = parseDashboardPasswordHash(configured);
    if (parsed === null) return false;
    const actual = await scrypt(password, parsed.salt, SCRYPT_KEY_LENGTH_BYTES);
    // timingSafeEqual throws on differing lengths, and the length check only
    // leaks the (fixed, public) key size, never a byte of either secret.
    if (actual.length !== parsed.expectedHash.length) return false;
    return timingSafeEqual(actual, parsed.expectedHash);
  } catch {
    return false;
  }
}
