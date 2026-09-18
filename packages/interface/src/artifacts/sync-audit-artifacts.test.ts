import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildArtifactBucketKey } from '@odysseus/scanner';
import type { ArtifactStore } from './artifact-store.js';
import { verifyBucketReadBack } from './sync-audit-artifacts.js';

const dirs: string[] = [];
function auditDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-read-back-'));
  dirs.push(dir);
  return dir;
}

/** In-memory stand-in for the bucket, keyed exactly like the real one. */
function fakeStore(objects: Map<string, Buffer>): ArtifactStore {
  return {
    async get(key) {
      return objects.get(key) ?? null;
    },
    async put(key, bytes) {
      objects.set(key, bytes);
    },
    async list() {
      return [...objects.keys()];
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

const HOSTNAME = 'example-hotel.fr';
const STARTED_AT = new Date('2026-09-18T09:00:00.000Z');
const PATHS = ['evidence/raw-evidence-snapshot.json', 'findings.json'] as const;

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('verifyBucketReadBack', () => {
  it('passes when the bucket holds every file byte for byte', async () => {
    const dir = auditDir();
    const objects = new Map<string, Buffer>();
    for (const relativePath of PATHS) {
      const bytes = Buffer.from(`${JSON.stringify({ relativePath })}\n`, 'utf8');
      fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(dir, relativePath), bytes);
      objects.set(buildArtifactBucketKey(HOSTNAME, STARTED_AT, relativePath), bytes);
    }
    await expect(
      verifyBucketReadBack(fakeStore(objects), dir, HOSTNAME, STARTED_AT, PATHS),
    ).resolves.toBeUndefined();
  });

  it('throws when a bucket copy differs from the local file', async () => {
    const dir = auditDir();
    const objects = new Map<string, Buffer>();
    for (const relativePath of PATHS) {
      const bytes = Buffer.from(`${JSON.stringify({ relativePath })}\n`, 'utf8');
      fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(dir, relativePath), bytes);
      objects.set(
        buildArtifactBucketKey(HOSTNAME, STARTED_AT, relativePath),
        relativePath === PATHS[0]
          ? bytes
          : Buffer.from(`${JSON.stringify({ relativePath, edited: true })}\n`, 'utf8'),
      );
    }
    await expect(
      verifyBucketReadBack(fakeStore(objects), dir, HOSTNAME, STARTED_AT, PATHS),
    ).rejects.toThrow(/read-back mismatch for findings\.json/);
  });

  it('throws when a file never made it to the bucket', async () => {
    const dir = auditDir();
    const objects = new Map<string, Buffer>();
    for (const relativePath of PATHS) {
      fs.mkdirSync(path.dirname(path.join(dir, relativePath)), { recursive: true });
      fs.writeFileSync(path.join(dir, relativePath), 'x');
    }
    objects.set(buildArtifactBucketKey(HOSTNAME, STARTED_AT, PATHS[0]), Buffer.from('x'));
    await expect(
      verifyBucketReadBack(fakeStore(objects), dir, HOSTNAME, STARTED_AT, PATHS),
    ).rejects.toThrow(/read-back mismatch for findings\.json/);
  });

  it('is a no-op when no store is configured', async () => {
    const dir = auditDir();
    await expect(
      verifyBucketReadBack(undefined, dir, HOSTNAME, STARTED_AT, ['missing.json']),
    ).resolves.toBeUndefined();
  });
});
