import { describe, expect, it } from 'vitest';
import { UNKNOWN_BUILD_ID, isKnownBuildId, normalizeBuildId } from './build-identity.js';

describe('isKnownBuildId', () => {
  it('accepts a short commit hash', () => {
    expect(isKnownBuildId('2b7eec6')).toBe(true);
  });

  it('rejects the sentinel, so callers cannot print it by accident', () => {
    expect(isKnownBuildId(UNKNOWN_BUILD_ID)).toBe(false);
  });

  it('rejects absent and blank values', () => {
    expect(isKnownBuildId(undefined)).toBe(false);
    expect(isKnownBuildId('')).toBe(false);
    expect(isKnownBuildId('   ')).toBe(false);
  });
});

describe('normalizeBuildId', () => {
  it('abbreviates a full commit SHA to git short form', () => {
    expect(normalizeBuildId('2b7eec6a1f4c9d0e5b8a3726c4d1e0f9a8b7c6d5')).toBe('2b7eec6');
  });

  it('leaves a value that is not a full SHA intact', () => {
    // A tag or an operator-set label would be corrupted by truncation.
    expect(normalizeBuildId('v2.1.0-rc3')).toBe('v2.1.0-rc3');
    expect(normalizeBuildId('2b7eec6')).toBe('2b7eec6');
  });

  it('trims surrounding whitespace, which git rev-parse output carries', () => {
    expect(normalizeBuildId('2b7eec6\n')).toBe('2b7eec6');
  });

  it('maps an empty value onto the sentinel rather than an empty build', () => {
    expect(normalizeBuildId('   ')).toBe(UNKNOWN_BUILD_ID);
  });
});
