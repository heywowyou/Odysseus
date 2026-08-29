import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  deriveObjectKey,
  hashPreviewToken,
  isValidPreviewToken,
  objectKeyForToken,
} from './preview-object';

interface KeyFixture {
  malformedTokens: string[];
  cases: { token: string; tokenHash: string; objectKey: string }[];
}

const fixture = JSON.parse(
  readFileSync(
    // Resolved from this file, not the working directory: the workspace runs
    // Vitest from the repository root and the site's own scripts do not.
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      'fixtures',
      'outreach-preview-keys.json',
    ),
    'utf8',
  ),
) as KeyFixture;

describe('preview object keys (site copy)', () => {
  it.each(fixture.cases)('derives the pinned hash and key for $token', (testCase) => {
    expect(isValidPreviewToken(testCase.token)).toBe(true);
    expect(hashPreviewToken(testCase.token)).toBe(testCase.tokenHash);
    expect(deriveObjectKey(testCase.tokenHash)).toBe(testCase.objectKey);
    expect(objectKeyForToken(testCase.token)).toBe(testCase.objectKey);
  });

  it.each(fixture.malformedTokens)('refuses the malformed token %j', (token) => {
    expect(isValidPreviewToken(token)).toBe(false);
    // null rather than a throw, so the route answers 404 for a malformed token
    // exactly as it does for an unknown one.
    expect(objectKeyForToken(token)).toBeNull();
    expect(() => hashPreviewToken(token)).toThrow(/malformed/u);
  });

  it('refuses to build a key from anything that is not a hash', () => {
    expect(() => deriveObjectKey('nope')).toThrow(/malformed/u);
    expect(() => deriveObjectKey('A'.repeat(64))).toThrow(/malformed/u);
  });
});
