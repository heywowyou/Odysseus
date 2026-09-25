/**
 * Plan 077: `GET /api/storage-status`, the artifacts disk's fill level and
 * the last recorded retention run, for the dashboard's storage block.
 * Read-only.
 */

import { promises as fs } from 'node:fs';
import type { Connection } from 'mongoose';
import { getArtifactsRoot } from '@odysseus/scanner';
import { getLatestRetentionRun, type RetentionRunDocument } from '@odysseus/store';
import { sendJson } from '../http-utils.js';
import {
  diskLevel,
  type DiskStatus,
  type RetentionRunSummary,
  type StorageStatusResponse,
} from '../retention/storage-status.js';
import type { Router } from '../router.js';

export async function readDiskStatus(root: string): Promise<DiskStatus | null> {
  try {
    const stats = await fs.statfs(root);
    const totalBytes = stats.blocks * stats.bsize;
    if (totalBytes <= 0) return null;
    // bavail, not bfree: space reserved for root is not space the app can use.
    const freeBytes = stats.bavail * stats.bsize;
    const usedPercent = Math.round(((totalBytes - freeBytes) / totalBytes) * 1000) / 10;
    return { totalBytes, freeBytes, usedPercent, level: diskLevel(usedPercent) };
  } catch {
    return null;
  }
}

export function summarizeRetentionRun(run: RetentionRunDocument): RetentionRunSummary {
  return {
    trigger: run.trigger,
    finishedAt: run.finishedAt.toISOString(),
    auditsDeleted: run.counts.auditsDeleted,
    auditsSlimmed: run.counts.auditsSlimmed,
    versionsDeleted:
      run.counts.reportsDeleted +
      run.counts.analysesDeleted +
      run.counts.structureFilesDeleted +
      run.counts.qualityCandidateSetsDeleted +
      run.counts.reportBundlesDeleted,
    auditsHeld: run.counts.auditsHeld,
    bytesReclaimedLocal: run.bytesReclaimed.local,
    failureCount: run.failures.length,
    refused: run.refusal !== undefined,
  };
}

export function registerStorageStatusRoutes(
  router: Router,
  connection: Connection,
  artifactsRoot: () => string = getArtifactsRoot,
): void {
  router.get('/api/storage-status', async ({ res }) => {
    const [disk, run] = await Promise.all([
      readDiskStatus(artifactsRoot()),
      getLatestRetentionRun(connection),
    ]);
    sendJson(res, 200, {
      disk,
      lastRetentionRun: run === null ? null : summarizeRetentionRun(run),
    } satisfies StorageStatusResponse);
  });
}
