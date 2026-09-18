import * as fsp from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalDirArtifactStore } from './local-dir-artifact-store.js';

describe('LocalDirArtifactStore', () => {
  it('round-trips bytes by key and returns null for missing keys', async () => {
    const root = await fsp.mkdtemp(path.join('.', 'tmp-local-store-'));
    try {
      const store = new LocalDirArtifactStore(root);
      expect(await store.get('report-quality/objects/bundle-manifest/x.json')).toBeNull();
      const bytes = Buffer.from('{"k":1}', 'utf8');
      await store.put('report-quality/objects/bundle-manifest/x.json', bytes);
      expect(await store.get('report-quality/objects/bundle-manifest/x.json')).toEqual(bytes);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it('lists keys under a prefix in provider order and never lists other keys', async () => {
    const root = await fsp.mkdtemp(path.join('.', 'tmp-local-store-'));
    try {
      const store = new LocalDirArtifactStore(root);
      await store.put('report-quality/objects/a/2.json', Buffer.from('2'));
      await store.put('report-quality/objects/a/1.json', Buffer.from('1'));
      await store.put('report-quality/candidates/x.pdf', Buffer.from('pdf'));
      expect(await store.list('report-quality/objects/a/')).toEqual([
        'report-quality/objects/a/1.json',
        'report-quality/objects/a/2.json',
      ]);
      expect(await store.list('report-quality/objects/')).toHaveLength(2);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it('deletes idempotently and refuses keys that escape the root', async () => {
    const root = await fsp.mkdtemp(path.join('.', 'tmp-local-store-'));
    try {
      const store = new LocalDirArtifactStore(root);
      await store.put('a/b.json', Buffer.from('x'));
      await store.delete('a/b.json');
      await store.delete('a/b.json');
      expect(await store.get('a/b.json')).toBeNull();
      await expect(store.put('../escape.json', Buffer.from('x'))).rejects.toThrow(/escapes/);
      await expect(store.get('../escape.json')).rejects.toThrow(/escapes/);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
