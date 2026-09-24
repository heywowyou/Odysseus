import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAuditDir } from '@odysseus/scanner';
import type { ArtifactStore } from './artifact-store.js';
import { compactStoredScans } from './compact-stored-scans.js';

const STARTED_AT = new Date('2026-09-16T10:00:00Z');
const PAGE_KEY = 'hotel.example/2026-09-16T10-00-00Z/pages/home-abc123/scan.json';

const legacyScan = {
  url: 'https://hotel.example/',
  axe: { violations: [], incomplete: [], passes: [{ id: 'pass', nodes: [] }] },
  lighthouse: {
    finalUrl: 'https://hotel.example/',
    fullPageScreenshot: { screenshot: { data: 'x'.repeat(2_000) } },
    audits: { 'final-screenshot': { details: { data: 'x'.repeat(2_000) } } },
  },
};

function memoryStore(failPut = false): ArtifactStore & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    get: async (key) => objects.get(key) ?? null,
    put: async (key, bytes) => {
      if (failPut) throw new Error('bucket unavailable');
      objects.set(key, bytes);
    },
    list: async (prefix) => [...objects.keys()].filter((key) => key.startsWith(prefix)),
    delete: async (key) => {
      objects.delete(key);
    },
  };
}

let root: string;
let scanPath: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-stored-scans-'));
  const pageDir = path.join(
    buildAuditDir(root, 'hotel.example', STARTED_AT),
    'pages',
    'home-abc123',
  );
  fs.mkdirSync(pageDir, { recursive: true });
  scanPath = path.join(pageDir, 'scan.json');
  fs.writeFileSync(scanPath, JSON.stringify(legacyScan, null, 2));
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('compactStoredScans', () => {
  it('measures without writing on a dry run', async () => {
    const before = fs.readFileSync(scanPath, 'utf-8');
    const store = memoryStore();

    const result = await compactStoredScans({ artifactsRoot: root, store, apply: false });

    expect(result.filesScanned).toBe(1);
    expect(result.filesCompacted).toBe(1);
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore);
    expect(fs.readFileSync(scanPath, 'utf-8')).toBe(before);
    expect(store.objects.size).toBe(0);
  });

  it('rewrites the file and its bucket copy, and a second run finds nothing', async () => {
    const store = memoryStore();

    await compactStoredScans({ artifactsRoot: root, store, apply: true });
    const rewritten = JSON.parse(fs.readFileSync(scanPath, 'utf-8'));
    const second = await compactStoredScans({ artifactsRoot: root, store, apply: true });

    expect(rewritten.scanJsonVersion).toBe(2);
    expect(rewritten.lighthouse).not.toHaveProperty('fullPageScreenshot');
    expect(store.objects.get(PAGE_KEY)?.toString()).toBe(fs.readFileSync(scanPath, 'utf-8'));
    expect(second.filesScanned).toBe(1);
    expect(second.filesCompacted).toBe(0);
  });

  it('leaves the original in place when the replace fails mid-write', async () => {
    const before = fs.readFileSync(scanPath, 'utf-8');

    const result = await compactStoredScans({
      artifactsRoot: root,
      store: undefined,
      apply: true,
      fileOps: {
        writeFileSync: (file, data, encoding) =>
          fs.writeFileSync(file, data.slice(0, 10), encoding),
        renameSync: () => {
          throw new Error('crash before rename');
        },
        rmSync: (file, options) => fs.rmSync(file, options),
      },
    });

    expect(result.failures).toEqual([
      expect.objectContaining({ step: 'local', message: 'crash before rename' }),
    ]);
    expect(fs.readFileSync(scanPath, 'utf-8')).toBe(before);
    expect(fs.readdirSync(path.dirname(scanPath))).toEqual(['scan.json']);
  });

  it('keeps the local original when the bucket upload fails, so a retry redoes both', async () => {
    const before = fs.readFileSync(scanPath, 'utf-8');

    const failed = await compactStoredScans({
      artifactsRoot: root,
      store: memoryStore(true),
      apply: true,
    });
    const afterFailure = fs.readFileSync(scanPath, 'utf-8');
    const store = memoryStore();
    const retried = await compactStoredScans({ artifactsRoot: root, store, apply: true });

    expect(failed.failures).toEqual([expect.objectContaining({ step: 'remote' })]);
    expect(afterFailure).toBe(before);
    expect(retried.failures).toEqual([]);
    expect(retried.filesCompacted).toBe(1);
    expect(store.objects.has(PAGE_KEY)).toBe(true);
  });

  it('leaves an unreadable file alone', async () => {
    fs.writeFileSync(scanPath, '{ truncated');

    const result = await compactStoredScans({ artifactsRoot: root, store: undefined, apply: true });

    expect(result.filesUnreadable).toBe(1);
    expect(fs.readFileSync(scanPath, 'utf-8')).toBe('{ truncated');
  });
});
