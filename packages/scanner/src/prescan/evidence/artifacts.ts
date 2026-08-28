import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type {
  HotelEvidenceCapturedAsset,
  HotelEvidenceSelectionReason,
  HotelPrescanPageRole,
} from '@odysseus/core';
import { readPngDimensions, type PngImage } from './image.js';

export interface EvidenceFileOperations {
  mkdir(target: string, options: { recursive: true }): Promise<string | undefined>;
  writeFile(target: string, bytes: Buffer, options: { flag: 'wx' }): Promise<void>;
  readFile(target: string): Promise<Buffer>;
  rename(from: string, to: string): Promise<void>;
  stat(target: string): Promise<{ size: number }>;
  unlink(target: string): Promise<void>;
  readdir(target: string, options: { withFileTypes: true }): Promise<Dirent[]>;
  rm(target: string, options: { recursive: true; force: true }): Promise<void>;
}

const DEFAULT_FILE_OPERATIONS: EvidenceFileOperations = {
  mkdir: (target, options) => fs.mkdir(target, options),
  writeFile: (target, bytes, options) => fs.writeFile(target, bytes, options),
  readFile: (target) => fs.readFile(target),
  rename: (from, to) => fs.rename(from, to),
  stat: (target) => fs.stat(target),
  unlink: (target) => fs.unlink(target),
  readdir: (target, options) => fs.readdir(target, options),
  rm: (target, options) => fs.rm(target, options),
};

export async function promoteEvidencePng(
  prescanDir: string,
  image: PngImage,
  metadata: {
    pageRole: HotelPrescanPageRole;
    factRef: string;
    altText: { fr: string; en: string };
    selectionReason: HotelEvidenceSelectionReason;
  },
  operations: EvidenceFileOperations = DEFAULT_FILE_OPERATIONS,
): Promise<HotelEvidenceCapturedAsset> {
  const actualDimensions = readPngDimensions(image.bytes);
  if (actualDimensions.width !== image.width || actualDimensions.height !== image.height) {
    throw new Error('Evidence PNG metadata does not match final bytes');
  }
  const sha256 = createHash('sha256').update(image.bytes).digest('hex');
  const evidenceDir = path.join(prescanDir, 'evidence');
  const finalPath = path.join(evidenceDir, `${sha256}.png`);
  const temporaryPath = path.join(evidenceDir, `.${sha256}.${process.pid}.tmp`);
  await operations.mkdir(evidenceDir, { recursive: true });
  try {
    await operations.writeFile(temporaryPath, image.bytes, { flag: 'wx' });
    try {
      await operations.rename(temporaryPath, finalPath);
    } catch (error) {
      try {
        await operations.stat(finalPath);
        await operations.unlink(temporaryPath);
      } catch {
        throw error;
      }
    }
    const [stored, stat] = await Promise.all([
      operations.readFile(finalPath),
      operations.stat(finalPath),
    ]);
    const storedHash = createHash('sha256').update(stored).digest('hex');
    if (storedHash !== sha256 || stat.size !== image.bytes.byteLength) {
      throw new Error('Promoted evidence PNG failed verification');
    }
    return {
      state: 'captured',
      ref: `evidence/${sha256}.png`,
      sha256,
      mimeType: 'image/png',
      byteSize: image.bytes.byteLength,
      width: image.width,
      height: image.height,
      ...metadata,
    };
  } catch (error) {
    await operations.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function prunePrescanCaptureFiles(
  prescanDir: string,
  retainedRefs: readonly string[],
  operations: EvidenceFileOperations = DEFAULT_FILE_OPERATIONS,
): Promise<void> {
  const retained = new Set(retainedRefs.map((ref) => path.resolve(prescanDir, ref)));
  const entries = await operations.readdir(prescanDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(prescanDir, entry.name);
    if (entry.name === 'expiry-manifest.json') continue;
    if (entry.name === 'evidence' && entry.isDirectory()) {
      const evidenceFiles = await operations.readdir(entryPath, { withFileTypes: true });
      for (const file of evidenceFiles) {
        const filePath = path.join(entryPath, file.name);
        if (!file.isFile() || !retained.has(path.resolve(filePath))) {
          await operations.rm(filePath, { recursive: true, force: true });
        }
      }
      continue;
    }
    await operations.rm(entryPath, { recursive: true, force: true });
  }
}

export async function writeExpiryManifest(
  prescanDir: string,
  expiresAt: Date,
  retainedRefs: readonly string[],
): Promise<void> {
  const finalPath = path.join(prescanDir, 'expiry-manifest.json');
  const temporaryPath = `${finalPath}.${process.pid}.tmp`;
  const bytes = `${JSON.stringify({ schemaVersion: 1, expiresAt: expiresAt.toISOString(), assets: retainedRefs })}\n`;
  try {
    await fs.writeFile(temporaryPath, bytes, { flag: 'wx' });
    await fs.rename(temporaryPath, finalPath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
