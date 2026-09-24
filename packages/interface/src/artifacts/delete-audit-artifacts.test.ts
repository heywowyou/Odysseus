import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAuditDir } from '@odysseus/scanner';
import type { ArtifactStore } from './artifact-store.js';
import { AuditArtifactDeletionError, deleteAuditArtifacts } from './delete-audit-artifacts.js';

function memoryStore(
  initial: string[],
  failures: { list?: boolean; delete?: boolean } = {},
): ArtifactStore & { keys: Set<string> } {
  const keys = new Set(initial);
  return {
    keys,
    get: async () => null,
    put: async (key) => {
      keys.add(key);
    },
    list: async (prefix) => {
      if (failures.list) throw new Error('listing unavailable');
      return [...keys].filter((key) => key.startsWith(prefix));
    },
    delete: async (key) => {
      if (failures.delete) throw new Error('provider said no');
      keys.delete(key);
    },
  };
}

const target = {
  siteUrl: 'https://hotel.example/',
  startedAt: new Date('2026-09-16T10:00:00Z'),
  auditId: 'audit/1',
};
const TARGET_PREFIX = 'hotel.example/2026-09-16T10-00-00Z/';
const NEIGHBOURS = [
  'hotel.example/2026-09-17T10-00-00Z/manifest.json',
  'other.example/2026-09-16T10-00-00Z/manifest.json',
  'report-quality/candidates/audit%2F10/run-1/fr-abc.pdf',
  'report-quality/objects/draft-fr/abc.json',
];

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'delete-audit-artifacts-'));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('deleteAuditArtifacts (issue #384)', () => {
  it('removes the local directory and only this audit’s bucket objects', async () => {
    const auditDir = buildAuditDir(root, 'hotel.example', target.startedAt);
    await fs.mkdir(auditDir, { recursive: true });
    await fs.writeFile(path.join(auditDir, 'manifest.json'), '{}');
    const store = memoryStore([
      `${TARGET_PREFIX}manifest.json`,
      `${TARGET_PREFIX}pages/p1/scan.json`,
      ...NEIGHBOURS,
    ]);

    const result = await deleteAuditArtifacts(target, { artifactsRoot: root, store });

    expect(result).toEqual({ remoteObjectsDeleted: 2 });
    await expect(fs.stat(auditDir)).rejects.toThrow();
    expect([...store.keys].sort()).toEqual(NEIGHBOURS);
  });

  it('also removes the audit’s private report-quality candidates, and no other audit’s', async () => {
    const store = memoryStore([
      'report-quality/candidates/audit%2F1/run-1/fr-abc.pdf',
      'report-quality/candidates/audit%2F1/run-2/en-def.pdf',
      ...NEIGHBOURS,
    ]);

    const result = await deleteAuditArtifacts(target, { artifactsRoot: root, store });

    expect(result).toEqual({ remoteObjectsDeleted: 2 });
    expect([...store.keys].sort()).toEqual(NEIGHBOURS);
  });

  it('names no candidate prefix for an orphan that no audit owns', async () => {
    const store = memoryStore([`${TARGET_PREFIX}manifest.json`, ...NEIGHBOURS]);

    await deleteAuditArtifacts({ ...target, auditId: null }, { artifactsRoot: root, store });

    expect([...store.keys].sort()).toEqual(NEIGHBOURS);
  });

  it('succeeds when the directory and the objects are already gone', async () => {
    const store = memoryStore(NEIGHBOURS);
    await expect(deleteAuditArtifacts(target, { artifactsRoot: root, store })).resolves.toEqual({
      remoteObjectsDeleted: 0,
    });
    expect([...store.keys].sort()).toEqual(NEIGHBOURS);
  });

  it('reports no remote half when the bucket is not configured', async () => {
    await expect(
      deleteAuditArtifacts(target, { artifactsRoot: root, store: undefined }),
    ).resolves.toEqual({ remoteObjectsDeleted: null });
  });

  it.each([{ list: true }, { delete: true }])(
    'throws a remote failure instead of claiming success (%o)',
    async (failures) => {
      const store = memoryStore([`${TARGET_PREFIX}manifest.json`], failures);
      const failure = deleteAuditArtifacts(target, { artifactsRoot: root, store });
      await expect(failure).rejects.toBeInstanceOf(AuditArtifactDeletionError);
      await expect(failure).rejects.toMatchObject({ half: 'remote' });
    },
  );
});
