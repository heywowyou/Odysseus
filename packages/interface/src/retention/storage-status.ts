/**
 * Plan 077: the artifacts-disk status the dashboard shows beside the last
 * retention run. Pure and free of Node imports, so the dashboard bundle and
 * the server read the same thresholds.
 */

export const DISK_WARNING_PERCENT = 75;
export const DISK_DANGER_PERCENT = 90;

export type DiskLevel = 'ok' | 'warning' | 'danger';

export function diskLevel(usedPercent: number): DiskLevel {
  if (usedPercent >= DISK_DANGER_PERCENT) return 'danger';
  if (usedPercent >= DISK_WARNING_PERCENT) return 'warning';
  return 'ok';
}

export interface DiskStatus {
  totalBytes: number;
  freeBytes: number;
  usedPercent: number;
  level: DiskLevel;
}

export interface RetentionRunSummary {
  trigger: 'sweeper' | 'cli';
  finishedAt: string;
  auditsDeleted: number;
  auditsSlimmed: number;
  versionsDeleted: number;
  auditsHeld: number;
  bytesReclaimedLocal: number;
  failureCount: number;
  refused: boolean;
}

export interface StorageStatusResponse {
  /** Null when the artifacts root could not be measured on this machine. */
  disk: DiskStatus | null;
  lastRetentionRun: RetentionRunSummary | null;
}
