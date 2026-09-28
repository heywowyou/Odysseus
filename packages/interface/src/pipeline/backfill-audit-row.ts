/**
 * Re-persists a stored audit's Mongo row from its on-disk artifacts.
 *
 * The problem this exists for: an audit scanned before findings provenance
 * existed has a database row with no stamp on it. `normalize <dir>` re-stamps
 * the manifest on disk and deliberately never touches Mongo, and the only
 * other writer of an audit row is the scan pipeline. So the stamped truth sat
 * on disk while the database kept saying "unstamped", the dashboard kept the
 * audit at `scanned`, every report read `unverified`, and no amount of
 * re-analysis could move it. The only way out was re-scanning the client's
 * site, which is uninvited traffic to fix a bookkeeping gap of ours.
 *
 * This is that missing write, and nothing more. It never normalizes, never
 * scans, never invents a stamp: it refuses a manifest that carries none, and
 * refuses one whose stamp does not describe the findings.json sitting beside
 * it. A stamp is only worth anything if it is impossible to get one by
 * asking nicely.
 */

import { primarySeverityRollup } from '@odysseus/core';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  assertFindingsProvenance,
  buildFindingsProvenance,
  type AuditManifest,
  type Finding,
  type FindingsProvenance,
} from '@odysseus/core';
import { persistAudit } from '@odysseus/store';

export interface BackfillAuditRowOptions {
  /** Verify the artifacts and report what would happen, without writing. */
  dryRun?: boolean;
}

export interface BackfillAuditRowResult {
  auditId: string;
  siteUrl: string;
  findingCount: number;
  findingsProvenance: FindingsProvenance;
  /** False for a dry run, which reaches the same verification and stops. */
  persisted: boolean;
}

export async function backfillAuditRow(
  auditDir: string,
  connection: Connection,
  options: BackfillAuditRowOptions = {},
): Promise<BackfillAuditRowResult> {
  const resolvedDir = path.resolve(auditDir);
  const manifest = JSON.parse(
    await fs.readFile(path.join(resolvedDir, 'manifest.json'), 'utf-8'),
  ) as AuditManifest;
  const findings = JSON.parse(
    await fs.readFile(path.join(resolvedDir, 'findings.json'), 'utf-8'),
  ) as Finding[];

  const findingsProvenance = buildFindingsProvenance(findings);
  // The comparison stays in core's one provenance authority; only the framing
  // is ours. Its message is written for the report path, and reading "report
  // generation aborted" while backfilling a database row sends the operator
  // looking in the wrong place, so the reason is re-stated in front of it
  // rather than reworded. Rewording would mean editing the normalize
  // directory, which is fingerprinted: a message-only edit there would
  // restamp every stored audit as stale, which is the very breakage this
  // command exists to undo.
  try {
    assertFindingsProvenance(manifest.findingsProvenance, findingsProvenance, 'manifest');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Backfill refused: ${resolvedDir} does not verify against its own findings.json. ` +
        `Run \`odysseus normalize\` on it first, then backfill again.\n${detail}`,
      { cause: error },
    );
  }

  if (options.dryRun !== true) {
    // Upsert by auditId, the semantics persistAudit already has for a retried
    // scan: this is the same audit, re-stated from the same artifacts.
    await persistAudit(
      connection,
      manifest,
      findings,
      undefined,
      primarySeverityRollup(manifest, findings),
    );
  }

  return {
    auditId: manifest.auditId,
    siteUrl: manifest.siteUrl,
    findingCount: findings.length,
    findingsProvenance,
    persisted: options.dryRun !== true,
  };
}
