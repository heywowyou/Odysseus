import path from 'node:path';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LIGHTHOUSE_TIMEOUT_MS,
  DEFAULT_MAX_PAGES,
  findWorkspaceRoot,
  getArtifactsRoot,
  getLighthouseTimeoutMs,
  getMaxCrawlDepth,
  getMaxPages,
  UNLIMITED_MAX_CRAWL_DEPTH,
} from './config.js';

const ENV_KEYS = [
  'ODYSSEUS_ARTIFACTS_ROOT',
  'MAX_PAGES',
  'MAX_CRAWL_DEPTH',
  'LIGHTHOUSE_TIMEOUT_MS',
] as const;
const originalEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) originalEnv[key] = process.env[key];

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('findWorkspaceRoot', () => {
  it('returns a directory that actually contains pnpm-workspace.yaml', () => {
    const root = findWorkspaceRoot();
    expect(existsSync(path.join(root, 'pnpm-workspace.yaml'))).toBe(true);
  });
});

describe('getArtifactsRoot', () => {
  it('defaults to <workspace root>/artifacts', () => {
    delete process.env.ODYSSEUS_ARTIFACTS_ROOT;
    expect(getArtifactsRoot()).toBe(path.join(findWorkspaceRoot(), 'artifacts'));
  });

  it('is stable regardless of process.cwd() at call time', () => {
    delete process.env.ODYSSEUS_ARTIFACTS_ROOT;
    const before = getArtifactsRoot();
    const originalCwd = process.cwd();
    try {
      process.chdir(path.join(originalCwd, 'packages', 'cli'));
      expect(getArtifactsRoot()).toBe(before);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('resolves an absolute ODYSSEUS_ARTIFACTS_ROOT as-is', () => {
    process.env.ODYSSEUS_ARTIFACTS_ROOT = '/tmp/odysseus-artifacts-test';
    expect(getArtifactsRoot()).toBe('/tmp/odysseus-artifacts-test');
  });

  it('resolves a relative ODYSSEUS_ARTIFACTS_ROOT against the workspace root', () => {
    process.env.ODYSSEUS_ARTIFACTS_ROOT = './custom-artifacts';
    expect(getArtifactsRoot()).toBe(path.join(findWorkspaceRoot(), 'custom-artifacts'));
  });
});

describe('positive-int env getters', () => {
  it('falls back to the default when the env var is unset', () => {
    delete process.env.MAX_PAGES;
    expect(getMaxPages()).toBe(DEFAULT_MAX_PAGES);
  });

  it('reads a valid override', () => {
    process.env.MAX_PAGES = '7';
    expect(getMaxPages()).toBe(7);
  });

  it('falls back to the default on an invalid value', () => {
    process.env.MAX_PAGES = 'not-a-number';
    expect(getMaxPages()).toBe(DEFAULT_MAX_PAGES);

    process.env.MAX_PAGES = '-3';
    expect(getMaxPages()).toBe(DEFAULT_MAX_PAGES);

    process.env.MAX_PAGES = '0';
    expect(getMaxPages()).toBe(DEFAULT_MAX_PAGES);
  });

  it('getMaxCrawlDepth reads MAX_CRAWL_DEPTH independently of MAX_PAGES', () => {
    delete process.env.MAX_CRAWL_DEPTH;
    process.env.MAX_PAGES = '99';
    // Unbounded by default since the depth cap was removed for the same
    // reason the page cap was: a page missing because the frontier stopped
    // at depth 5 is just as absent from a paid audit as one missing at page
    // 20, and it went unmentioned where a page cap is disclosed.
    expect(getMaxCrawlDepth()).toBe(UNLIMITED_MAX_CRAWL_DEPTH);
  });

  it('getMaxCrawlDepth still honours an explicit operator bound', () => {
    process.env.MAX_CRAWL_DEPTH = '3';
    expect(getMaxCrawlDepth()).toBe(3);
  });

  it('getLighthouseTimeoutMs falls back to the default when unset', () => {
    delete process.env.LIGHTHOUSE_TIMEOUT_MS;
    expect(getLighthouseTimeoutMs()).toBe(DEFAULT_LIGHTHOUSE_TIMEOUT_MS);
  });

  it('getLighthouseTimeoutMs reads a valid override', () => {
    process.env.LIGHTHOUSE_TIMEOUT_MS = '90000';
    expect(getLighthouseTimeoutMs()).toBe(90_000);
  });
});
