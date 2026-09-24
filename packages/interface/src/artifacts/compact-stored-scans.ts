/**
 * Plan 077: rewrites stored per-page scan.json files into the compact shape
 * new scans already get (`compactScanJson`, the one owner of the trim
 * rules). Findings provenance hashes the normalized findings, not these
 * bytes, and the trimmed keys are read by nothing, so a compacted audit
 * renormalizes to the same findings digest.
 *
 * Each file is replaced through a temp file and a rename, so a crash leaves
 * either the original or the compacted file, never a truncated one. When a
 * bucket is configured its copy is replaced first, so any failure leaves the
 * local original for the next run to retry. A second run finds nothing left
 * to do.
 */

import * as fs from 'node:fs';
import path from 'node:path';
import {
  buildArtifactBucketKey,
  compactScanJson,
  parseAuditTimestampDir,
  writeJsonAtomicSync,
  type AtomicJsonFileOps,
  type PageScanResult,
} from '@odysseus/scanner';
import type { ArtifactStore } from './artifact-store.js';

export interface CompactStoredScansOptions {
  artifactsRoot: string;
  store: ArtifactStore | undefined;
  /** Without it, the files are measured and nothing is written. */
  apply: boolean;
  /** Test seam for the atomic replace. */
  fileOps?: AtomicJsonFileOps;
}

export interface CompactStoredScansFailure {
  file: string;
  step: 'local' | 'remote';
  message: string;
}

export interface CompactStoredScansResult {
  filesScanned: number;
  /** Files that were rewritten, or would be on a dry run. */
  filesCompacted: number;
  /** Files that could not be parsed; they are left untouched. */
  filesUnreadable: number;
  bytesBefore: number;
  bytesAfter: number;
  failures: CompactStoredScansFailure[];
}

interface StoredScanFile {
  hostname: string;
  startedAt: Date;
  auditDir: string;
  relativePath: string;
}

function listStoredScanFiles(artifactsRoot: string): StoredScanFile[] {
  const files: StoredScanFile[] = [];
  const readDirs = (dir: string): fs.Dirent[] => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      return [];
    }
  };
  for (const host of readDirs(artifactsRoot)) {
    for (const stamp of readDirs(path.join(artifactsRoot, host.name))) {
      let startedAt: Date;
      try {
        startedAt = parseAuditTimestampDir(stamp.name);
      } catch {
        continue;
      }
      const auditDir = path.join(artifactsRoot, host.name, stamp.name);
      for (const page of readDirs(path.join(auditDir, 'pages'))) {
        const relativePath = path.join('pages', page.name, 'scan.json');
        if (!fs.existsSync(path.join(auditDir, relativePath))) continue;
        files.push({ hostname: host.name, startedAt, auditDir, relativePath });
      }
    }
  }
  return files;
}

export async function compactStoredScans(
  options: CompactStoredScansOptions,
): Promise<CompactStoredScansResult> {
  const result: CompactStoredScansResult = {
    filesScanned: 0,
    filesCompacted: 0,
    filesUnreadable: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    failures: [],
  };

  for (const file of listStoredScanFiles(options.artifactsRoot)) {
    const filePath = path.join(file.auditDir, file.relativePath);
    result.filesScanned += 1;
    let raw: string;
    let parsed: PageScanResult;
    try {
      raw = fs.readFileSync(filePath, 'utf-8');
      parsed = JSON.parse(raw) as PageScanResult;
    } catch {
      result.filesUnreadable += 1;
      continue;
    }
    const compacted = compactScanJson(parsed);
    if (JSON.stringify(compacted) === JSON.stringify(parsed)) continue;

    const compactedText = `${JSON.stringify(compacted, null, 2)}\n`;
    result.filesCompacted += 1;
    result.bytesBefore += Buffer.byteLength(raw);
    result.bytesAfter += Buffer.byteLength(compactedText);
    if (!options.apply) continue;

    // Bucket first: if the upload fails, the local file is still the
    // original, so the next run finds it again and retries both halves.
    if (options.store !== undefined) {
      try {
        await options.store.put(
          buildArtifactBucketKey(file.hostname, file.startedAt, file.relativePath),
          Buffer.from(compactedText),
        );
      } catch (error) {
        result.failures.push({ file: filePath, step: 'remote', message: (error as Error).message });
        continue;
      }
    }
    try {
      writeJsonAtomicSync(filePath, compacted, options.fileOps);
    } catch (error) {
      result.failures.push({ file: filePath, step: 'local', message: (error as Error).message });
    }
  }
  return result;
}
