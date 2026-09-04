/**
 * Uploads audit-directory files to the artifact bucket, issue #63. Called
 * after a local write already succeeded (audit-stage.ts, report-stage.ts),
 * never before, so a bucket failure can never block an already-valid local
 * deliverable from being written; a failure here throws and surfaces as a
 * job failure exactly like any other pipeline stage failure, since a
 * persisted sync-status flag would just be a second source of truth for
 * what the job's own status already expresses.
 *
 * No store configured (bucket not provisioned yet, or credentials unset on
 * this machine - see createConfiguredArtifactStore) means sync is skipped
 * entirely, not attempted and ignored: every deployment without the bucket
 * set up keeps behaving exactly as it did before this issue.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildArtifactBucketKey } from '@odysseus/scanner';
import type { ArtifactStore } from './artifact-store.js';

/** Recursively lists every regular file under `root`, as paths relative to
 *  `root`. Node's own recursive readdir, not a hand-rolled walk. */
async function listFilesRecursive(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
}

/** Uploads every file already written under `auditDir` (manifest.json,
 *  findings.json, and every pages/** file) to the bucket, keyed the same
 *  way buildAuditDir names them on disk. A no-op when no store is
 *  configured. */
export async function syncAuditDirToBucket(
  store: ArtifactStore | undefined,
  auditDir: string,
  hostname: string,
  startedAt: Date,
): Promise<void> {
  if (!store) return;
  const relativePaths = await listFilesRecursive(auditDir);
  await Promise.all(
    relativePaths.map(async (relativePath) => {
      const bytes = await fs.readFile(path.join(auditDir, relativePath));
      await store.put(buildArtifactBucketKey(hostname, startedAt, relativePath), bytes);
    }),
  );
}

/** Uploads an explicit list of already-written files (report-stage.ts's PDF
 *  plus its provenance sidecar), each given as an absolute path under
 *  `auditDir`. A no-op when no store is configured. */
export async function syncArtifactFilesToBucket(
  store: ArtifactStore | undefined,
  auditDir: string,
  hostname: string,
  startedAt: Date,
  absoluteFilePaths: readonly string[],
): Promise<void> {
  if (!store) return;
  await Promise.all(
    absoluteFilePaths.map(async (filePath) => {
      const bytes = await fs.readFile(filePath);
      const relativePath = path.relative(auditDir, filePath);
      await store.put(buildArtifactBucketKey(hostname, startedAt, relativePath), bytes);
    }),
  );
}
