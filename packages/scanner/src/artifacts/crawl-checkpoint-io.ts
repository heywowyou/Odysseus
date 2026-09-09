/**
 * Plan 035 (issue #124): everything about the two crawl-phase checkpoint
 * files that live inside an audit directory. crawl-checkpoint.json is
 * written once the crawl coverage gate passes and before any content work,
 * so a crashed or redeployed full audit can skip the crawl entirely on its
 * next attempt; crawl-state.json (the throttled frontier snapshot consumed
 * by a later slice of plan 035) gets its name here too, so the two file
 * names stay defined in exactly one place.
 *
 * Both files follow the sync-write convention documented in page-scan-io.ts
 * and write-audit.ts (WSL2 io_uring async writes have hung forever on this
 * exact kind of step): every write is a synchronous temp-file write plus a
 * same-volume rename, never the async fs API.
 */

import * as fs from 'node:fs';
import path from 'node:path';
import type { AuditConfigSnapshot } from '@odysseus/core';
import type { CrawlResult } from '../crawl.js';
import { FULL_AUDIT_PLANNER_VERSION } from '../full-audit-plan.js';

export const CRAWL_CHECKPOINT_FILENAME = 'crawl-checkpoint.json';
export const CRAWL_STATE_FILENAME = 'crawl-state.json';

/** Fingerprint of the code that produced a checkpoint's crawl. A resume
 *  trusts a checkpoint only when every field matches exactly: a different
 *  scanner or planner version may crawl differently, so its inventories
 *  are never mixed. */
export interface ScanToolIdentity {
  format: 'full-audit-crawl-checkpoint-v1';
  scannerVersion: string;
  plannerVersion: string;
}

export interface CrawlCheckpoint {
  checkpointVersion: 'v1';
  /** The audit run's own startedAt (the job's runIdentity stamp), ISO
   *  encoded, so a checkpoint can never be attached to a different audit
   *  directory than the one it was written for. */
  startedAt: string;
  config: AuditConfigSnapshot;
  toolIdentity: ScanToolIdentity;
  crawl: CrawlResult;
}

export type CheckpointRejectionReason =
  | 'missing'
  | 'corrupt'
  | 'config-mismatch'
  | 'tool-mismatch'
  | 'started-at-mismatch'
  | 'version-mismatch';

export type CheckpointReuseVerdict =
  { reusable: true } | { reusable: false; reason: CheckpointRejectionReason };

/** Read at call time, not module load: the value must describe the code
 *  that is actually running, and the relative URL resolves both under
 *  vitest (running from src) and under the compiled dist layout. */
function readScannerVersion(): string {
  try {
    const raw = fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function buildScanToolIdentity(): ScanToolIdentity {
  return {
    format: 'full-audit-crawl-checkpoint-v1',
    scannerVersion: readScannerVersion(),
    plannerVersion: FULL_AUDIT_PLANNER_VERSION,
  };
}

/** Deterministic deep equality for plain JSON data: object keys are
 *  compared in sorted order so key insertion order can never decide a
 *  resume verdict, and no dependency is pulled in for what is a dozen
 *  lines over JSON-only values. Used for the config and tool-identity
 *  compares below, where a byte-stable view of both sides is the point. */
export function jsonDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => jsonDeepEqual(entry, b[index]));
  }
  if (isPlainJsonRecord(a) && isPlainJsonRecord(b)) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    return (
      keysA.length === keysB.length &&
      keysA.every((key, index) => key === keysB[index] && jsonDeepEqual(a[key], b[key]))
    );
  }
  return false;
}

function isPlainJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function writeCrawlCheckpoint(auditDir: string, checkpoint: CrawlCheckpoint): void {
  const target = path.join(auditDir, CRAWL_CHECKPOINT_FILENAME);
  const temp = path.join(auditDir, `.${CRAWL_CHECKPOINT_FILENAME}.tmp`);
  fs.writeFileSync(temp, JSON.stringify(checkpoint, null, 2));
  fs.renameSync(temp, target);
}

export function readCrawlCheckpoint(auditDir: string): CrawlCheckpoint | undefined {
  const target = path.join(auditDir, CRAWL_CHECKPOINT_FILENAME);
  if (!fs.existsSync(target)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8')) as CrawlCheckpoint;
  } catch {
    return undefined;
  }
}

export function deleteCrawlCheckpoint(auditDir: string): void {
  fs.rmSync(path.join(auditDir, CRAWL_CHECKPOINT_FILENAME), { force: true });
}

export function deleteCrawlStateFile(auditDir: string): void {
  fs.rmSync(path.join(auditDir, CRAWL_STATE_FILENAME), { force: true });
}

function isWellFormedCheckpoint(value: unknown): value is CrawlCheckpoint {
  if (!isPlainJsonRecord(value)) return false;
  return (
    typeof value['checkpointVersion'] === 'string' &&
    typeof value['startedAt'] === 'string' &&
    isPlainJsonRecord(value['config']) &&
    isPlainJsonRecord(value['toolIdentity']) &&
    isPlainJsonRecord(value['crawl'])
  );
}

/** Pure resume decision over a checkpoint as read from disk. A checkpoint
 *  is reused only when its format version, whole effective config, tool
 *  identity, and run startedAt all match exactly; anything else reasons
 *  the mismatch so the caller can report and start fresh. Structural
 *  garbage that still parsed as JSON is 'corrupt', never a mismatch: an
 *  unreadable file must not be mistaken for a legitimate difference. */
export function isReusableCheckpoint(
  checkpoint: CrawlCheckpoint | undefined,
  expected: { startedAt: Date; config: AuditConfigSnapshot; toolIdentity: ScanToolIdentity },
): CheckpointReuseVerdict {
  if (checkpoint === undefined) return { reusable: false, reason: 'missing' };
  if (!isWellFormedCheckpoint(checkpoint)) return { reusable: false, reason: 'corrupt' };
  if (checkpoint.checkpointVersion !== 'v1') {
    return { reusable: false, reason: 'version-mismatch' };
  }
  if (!jsonDeepEqual(checkpoint.config, expected.config)) {
    return { reusable: false, reason: 'config-mismatch' };
  }
  if (!jsonDeepEqual(checkpoint.toolIdentity, expected.toolIdentity)) {
    return { reusable: false, reason: 'tool-mismatch' };
  }
  if (checkpoint.startedAt !== expected.startedAt.toISOString()) {
    return { reusable: false, reason: 'started-at-mismatch' };
  }
  return { reusable: true };
}
