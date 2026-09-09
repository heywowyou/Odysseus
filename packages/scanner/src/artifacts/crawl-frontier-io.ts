/**
 * Plan 035 (issue #124) step 4: the crawl-state.json frontier file, the
 * periodic mid-crawl snapshot a crashed full audit resumes its crawl from.
 * crawl.ts owns the state shape; this module owns only the file. The file
 * name itself stays defined in crawl-checkpoint-io.ts, so the checkpoint
 * and frontier file names each live in exactly one place.
 *
 * Writes follow the sync convention documented in page-scan-io.ts and
 * write-audit.ts (WSL2 io_uring async writes have hung forever on this
 * exact kind of step): a synchronous temp-file write plus a same-volume
 * rename, never the async fs API. The mid-crawl write path makes the sync
 * requirement doubly binding - writeState is called from inside the crawl
 * loop with a snapshot that aliases live in-memory structures.
 */

import * as fs from 'node:fs';
import path from 'node:path';
import type { AuditConfigSnapshot } from '@odysseus/core';
import {
  CONTINUATION_FAMILY_MAX_ENQUEUED,
  CONTINUATION_GUARD_VERSION,
} from '../continuation-guard.js';
import type { CrawlFrontierState } from '../crawl.js';
import {
  CRAWL_STATE_FILENAME,
  jsonDeepEqual,
  type CheckpointRejectionReason,
  type ScanToolIdentity,
} from './crawl-checkpoint-io.js';

export { CRAWL_STATE_FILENAME };

export type CrawlFrontierReuseVerdict =
  { reusable: true } | { reusable: false; reason: CheckpointRejectionReason };

function isPlainJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural well-formedness short of identity: an inner state object
 *  with a guard block carrying the two fields the version checks read.
 *  Structural garbage that still parsed as JSON is 'corrupt', never a
 *  mismatch, mirroring the checkpoint rule. */
function isWellFormedFrontierState(value: CrawlFrontierState): boolean {
  const inner = value['state'] as unknown;
  if (!isPlainJsonRecord(inner)) return false;
  const guard = inner['guard'];
  if (!isPlainJsonRecord(guard)) return false;
  return (
    typeof guard['guardVersion'] === 'string' && typeof guard['familyMaxEnqueued'] === 'number'
  );
}

export function writeCrawlFrontierState(auditDir: string, state: CrawlFrontierState): void {
  const target = path.join(auditDir, CRAWL_STATE_FILENAME);
  const temp = path.join(auditDir, `.${CRAWL_STATE_FILENAME}.tmp`);
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, target);
}

export function readCrawlFrontierState(auditDir: string): CrawlFrontierState | undefined {
  const target = path.join(auditDir, CRAWL_STATE_FILENAME);
  if (!fs.existsSync(target)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf-8')) as CrawlFrontierState;
  } catch {
    return undefined;
  }
}

export function deleteCrawlFrontierState(auditDir: string): void {
  fs.rmSync(path.join(auditDir, CRAWL_STATE_FILENAME), { force: true });
}

/** Pure resume decision over a frontier state as read from disk, the
 *  frontier counterpart of isReusableCheckpoint: the format version, the
 *  guard snapshot's version and family cap, the whole effective config,
 *  the tool identity, and the run startedAt must all match exactly. The
 *  guard version and cap are checked here directly (not by constructing a
 *  ContinuationGuard) so this function stays pure for tests; crawl.ts's
 *  restore path re-validates them by construction. */
export function isReusableFrontierState(
  state: CrawlFrontierState | undefined,
  expected: { startedAt: Date; config: AuditConfigSnapshot; toolIdentity: ScanToolIdentity },
): CrawlFrontierReuseVerdict {
  if (state === undefined) return { reusable: false, reason: 'missing' };
  if (!isWellFormedFrontierState(state)) return { reusable: false, reason: 'corrupt' };
  if (state.format !== 'full-audit-crawl-frontier-v1') {
    return { reusable: false, reason: 'version-mismatch' };
  }
  if (state.state.guard.guardVersion !== CONTINUATION_GUARD_VERSION) {
    return { reusable: false, reason: 'version-mismatch' };
  }
  if (state.state.guard.familyMaxEnqueued !== CONTINUATION_FAMILY_MAX_ENQUEUED) {
    return { reusable: false, reason: 'version-mismatch' };
  }
  if (!jsonDeepEqual(state.config, expected.config)) {
    return { reusable: false, reason: 'config-mismatch' };
  }
  if (!jsonDeepEqual(state.toolIdentity, expected.toolIdentity)) {
    return { reusable: false, reason: 'tool-mismatch' };
  }
  if (state.startedAt !== expected.startedAt.toISOString()) {
    return { reusable: false, reason: 'started-at-mismatch' };
  }
  return { reusable: true };
}
