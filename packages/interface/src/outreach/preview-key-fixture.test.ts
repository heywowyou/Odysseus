import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveObjectKey, hashPreviewToken, isValidPreviewToken } from './preview-token.js';

/**
 * The other half of the drift check.
 *
 * `packages/site/lib/preview-object.ts` holds a deliberate copy of this
 * package's token validation, hashing and key derivation, because the public
 * site must not import a private workspace package. Both copies assert against
 * this one fixture, so a change to either derivation turns the *other*
 * package's test red rather than letting the two quietly disagree about which
 * object a link points at.
 *
 * The pinned values are also a compatibility statement: changing them
 * invalidates every preview already published, because a live link's object
 * would no longer be found at the key its token derives.
 */
const fixture = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      'fixtures',
      'outreach-preview-keys.json',
    ),
    'utf8',
  ),
) as {
  malformedTokens: string[];
  cases: { token: string; tokenHash: string; objectKey: string }[];
};

describe('preview key derivation (interface copy)', () => {
  it('has cases to assert', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases)('derives the pinned hash and key for $token', (testCase) => {
    expect(isValidPreviewToken(testCase.token)).toBe(true);
    expect(hashPreviewToken(testCase.token)).toBe(testCase.tokenHash);
    expect(deriveObjectKey(testCase.tokenHash)).toBe(testCase.objectKey);
  });

  it.each(fixture.malformedTokens)('refuses the malformed token %j', (token) => {
    expect(isValidPreviewToken(token)).toBe(false);
  });
});
