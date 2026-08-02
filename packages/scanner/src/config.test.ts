import path from 'node:path';
import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_PAGES,
  findWorkspaceRoot,
  getArtifactsRoot,
  getMaxCrawlDepth,
  getMaxPages,
} from './config.js';

const ENV_KEYS = ['ODYSSEUS_ARTIFACTS_ROOT', 'MAX_PAGES', 'MAX_CRAWL_DEPTH'] as const;
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
    expect(getMaxCrawlDepth()).toBe(5);
  });
});
