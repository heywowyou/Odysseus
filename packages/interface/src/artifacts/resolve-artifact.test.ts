import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveArtifactFile } from './resolve-artifact.js';
import type { ArtifactStore } from './artifact-store.js';

function fakeStore(seed: Record<string, Buffer> = {}): ArtifactStore & { calls: string[] } {
  const objects = new Map(Object.entries(seed));
  const calls: string[] = [];
  return {
    calls,
    async get(key: string): Promise<Buffer | null> {
      calls.push(key);
      return objects.get(key) ?? null;
    },
    async put(key: string, bytes: Buffer): Promise<void> {
      objects.set(key, bytes);
    },
    async list(prefix: string): Promise<string[]> {
      return [...objects.keys()].filter((key) => key.startsWith(prefix));
    },
    async delete(key: string): Promise<void> {
      objects.delete(key);
    },
  };
}

describe('resolveArtifactFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-resolve-artifact-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads locally and never calls the store on a local hit', async () => {
    const localPath = path.join(dir, 'manifest.json');
    await fs.writeFile(localPath, 'local content');
    const store = fakeStore();

    const bytes = await resolveArtifactFile(localPath, 'example.com/audit/manifest.json', store);

    expect(bytes.toString()).toBe('local content');
    expect(store.calls).toHaveLength(0);
  });

  it('falls back to the bucket on a local miss and writes the result back as a cache', async () => {
    const localPath = path.join(dir, 'nested', 'manifest.json');
    const bucketKey = 'example.com/audit/manifest.json';
    const store = fakeStore({ [bucketKey]: Buffer.from('bucket content') });

    const bytes = await resolveArtifactFile(localPath, bucketKey, store);

    expect(bytes.toString()).toBe('bucket content');
    expect(store.calls).toEqual([bucketKey]);
    const cached = await fs.readFile(localPath, 'utf-8');
    expect(cached).toBe('bucket content');
  });

  it('throws with no partial cache file when both the local disk and the bucket miss', async () => {
    const localPath = path.join(dir, 'manifest.json');
    const store = fakeStore();

    await expect(
      resolveArtifactFile(localPath, 'example.com/audit/manifest.json', store),
    ).rejects.toThrow(/not found locally.*or in the bucket/su);
    await expect(fs.access(localPath)).rejects.toThrow();
  });

  it('throws the original local error, with no store call, when no store is configured', async () => {
    const localPath = path.join(dir, 'manifest.json');

    await expect(
      resolveArtifactFile(localPath, 'example.com/audit/manifest.json', undefined),
    ).rejects.toThrow();
  });

  it('rethrows a non-ENOENT local error instead of treating it as a bucket-fallback case', async () => {
    // A directory can be opened for readFile without ENOENT on some
    // platforms failing differently (EISDIR), which must not be silently
    // reinterpreted as "missing, try the bucket".
    const dirAsFile = path.join(dir, 'a-directory');
    await fs.mkdir(dirAsFile);
    const store = fakeStore({ k: Buffer.from('should never be reached') });

    await expect(resolveArtifactFile(dirAsFile, 'k', store)).rejects.toThrow();
    expect(store.calls).toHaveLength(0);
  });
});
