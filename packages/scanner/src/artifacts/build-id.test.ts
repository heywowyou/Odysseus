import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNKNOWN_BUILD_ID } from '@odysseus/core';
import { readOdysseusBuildId } from './manifest.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

// Issue #58: the deployment image carries no git checkout (.dockerignore
// excludes .git), so deriving the build from `git rev-parse` at runtime
// resolved the sentinel for every render in production, and the report
// printed that word to the client. The commit is stamped into the
// environment at image build time instead, and takes precedence here.
describe('readOdysseusBuildId', () => {
  it('prefers a stamped build id over the git checkout', () => {
    vi.stubEnv('ODYSSEUS_BUILD_ID', 'deadbee');
    expect(readOdysseusBuildId()).toBe('deadbee');
  });

  it('abbreviates a stamped full commit SHA, which is what release.sh passes', () => {
    vi.stubEnv('ODYSSEUS_BUILD_ID', '2b7eec6a1f4c9d0e5b8a3726c4d1e0f9a8b7c6d5');
    expect(readOdysseusBuildId()).toBe('2b7eec6');
  });

  it('ignores a blank stamp rather than reporting an empty build', () => {
    // An unstamped local image build passes through as an empty string.
    vi.stubEnv('ODYSSEUS_BUILD_ID', '   ');
    expect(readOdysseusBuildId()).not.toBe('');
  });

  it('resolves something usable in a development checkout', () => {
    vi.stubEnv('ODYSSEUS_BUILD_ID', '');
    const buildId = readOdysseusBuildId();
    // The suite runs from a git checkout, so this exercises the fallback
    // path rather than asserting a specific commit.
    expect(buildId).not.toBe(UNKNOWN_BUILD_ID);
    expect(buildId.trim()).not.toBe('');
  });
});
