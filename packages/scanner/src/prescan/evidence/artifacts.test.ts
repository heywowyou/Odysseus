import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  promoteEvidencePng,
  prunePrescanCaptureFiles,
  type EvidenceFileOperations,
} from './artifacts.js';

let scratchDir = '';

afterEach(async () => {
  if (scratchDir !== '') await fs.rm(scratchDir, { recursive: true, force: true });
});

function operations(overrides: Partial<EvidenceFileOperations> = {}): EvidenceFileOperations {
  return {
    mkdir: (target, options) => fs.mkdir(target, options),
    writeFile: (target, bytes, options) => fs.writeFile(target, bytes, options),
    readFile: (target) => fs.readFile(target),
    rename: (from, to) => fs.rename(from, to),
    stat: (target) => fs.stat(target),
    unlink: (target) => fs.unlink(target),
    readdir: (target, options) => fs.readdir(target, options),
    rm: (target, options) => fs.rm(target, options),
    ...overrides,
  };
}

const metadata = {
  pageRole: 'booking' as const,
  factRef: `fact_${'a'.repeat(24)}`,
  altText: { fr: 'Preuve', en: 'Evidence' },
  selectionReason: 'booking-form-error' as const,
};

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('prescan evidence artifacts', () => {
  it('promotes verified bytes to their content address and prunes generic captures', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-evidence-artifacts-'));
    const bytes = PNG;
    await fs.mkdir(path.join(scratchDir, 'pages', 'home'), { recursive: true });
    await fs.writeFile(path.join(scratchDir, 'pages', 'home', 'raw.png'), bytes);

    const asset = await promoteEvidencePng(scratchDir, { bytes, width: 1, height: 1 }, metadata);
    const expectedHash = createHash('sha256').update(bytes).digest('hex');
    expect(asset.ref).toBe(`evidence/${expectedHash}.png`);
    await prunePrescanCaptureFiles(scratchDir, [asset.ref]);
    expect(await fs.readdir(scratchDir)).toEqual(['evidence']);
    await expect(fs.readFile(path.join(scratchDir, asset.ref))).resolves.toEqual(bytes);
  });

  it('removes a partial write when writing fails', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-evidence-artifacts-'));
    const failing = operations({
      writeFile: async (target, bytes) => {
        await fs.writeFile(target, bytes.subarray(0, 3));
        throw new Error('partial write');
      },
    });
    await expect(
      promoteEvidencePng(scratchDir, { bytes: PNG, width: 1, height: 1 }, metadata, failing),
    ).rejects.toThrow('partial write');
    expect(await fs.readdir(path.join(scratchDir, 'evidence'))).toEqual([]);
  });

  it('removes the temporary file when atomic promotion fails', async () => {
    scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-evidence-artifacts-'));
    const failing = operations({
      rename: async () => {
        throw new Error('rename failed');
      },
      stat: async () => {
        throw new Error('target missing');
      },
    });
    await expect(
      promoteEvidencePng(scratchDir, { bytes: PNG, width: 1, height: 1 }, metadata, failing),
    ).rejects.toThrow('rename failed');
    expect(await fs.readdir(path.join(scratchDir, 'evidence'))).toEqual([]);
  });
});
