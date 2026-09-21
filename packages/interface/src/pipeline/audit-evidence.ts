/**
 * Shared on-disk evidence reader for the preparation workflow: the audit's
 * manifest.json and findings.json artifacts. Journey evidence and hook
 * resolution read these files rather than the Mongo audit document, whose
 * schema deliberately does not persist `siteSignals` (trade-off 62).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  buildFindingsProvenance,
  type AuditManifest,
  type Finding,
  type FindingsProvenance,
} from '@odysseus/core';
import type { AuditDocument } from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import { RegenerationConflictError } from './regeneration-conflict-error.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';
import { syncAuditDirToBucket } from '../artifacts/sync-audit-artifacts.js';
import { backfillAuditRow } from './backfill-audit-row.js';
import { renormalizeAudit } from './renormalize-audit.js';

export interface AuditEvidence {
  auditDir: string;
  manifest: AuditManifest;
  findings: Finding[];
}

export interface RefreshedAuditEvidence extends AuditEvidence {
  findingsWereRefreshed: boolean;
}

/** True when the manifest stamp no longer describes the findings under the
 * current normalization rules. The digest is deliberately not part of this
 * pre-flight check: renormalizeAudit is the operation that recomputes the
 * digest from the stored scan evidence and writes the authoritative stamp. */
export function findingsAreStale(
  stamped: FindingsProvenance | undefined,
  findings: Finding[],
): boolean {
  const current = buildFindingsProvenance(findings);
  return (
    stamped === undefined ||
    stamped.findingsSchemaVersion !== current.findingsSchemaVersion ||
    stamped.normalizationFingerprint !== current.normalizationFingerprint
  );
}

/** Throws RegenerationConflictError when the artifacts are missing, which
 *  routes map to 409: regeneration and candidate previews cannot run
 *  without the evidence, while the read-only preparation view degrades
 *  gracefully instead (it catches and passes evidence-unavailable). */
export async function readAuditEvidence(audit: AuditDocument): Promise<AuditEvidence> {
  const auditDir = buildAuditDir(
    getArtifactsRoot(),
    new URL(audit.siteUrl).hostname,
    audit.startedAt,
  );
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(auditDir, 'manifest.json'), 'utf-8'),
    ) as AuditManifest;
    const findings = JSON.parse(
      await fs.readFile(path.join(auditDir, 'findings.json'), 'utf-8'),
    ) as Finding[];
    return { auditDir, manifest, findings };
  } catch {
    throw new RegenerationConflictError('odysseus: audit artifacts not found on disk');
  }
}

/**
 * Reads an existing audit and refreshes stale derived findings before an
 * analysis stage consumes them. This is the on-demand equivalent of the
 * report-production refresh: it only reads the stored page scan artifacts,
 * never launches Chromium or contacts the audited site.
 *
 * The database row and configured artifact bucket are updated after the local
 * normalization succeeds so the dashboard, another worker, and a future
 * report action all observe the same provenance. A second read returns the
 * exact manifest/findings pair that the caller must pass to analysis.
 */
export async function refreshStaleAuditEvidence(
  connection: Connection,
  audit: AuditDocument,
  artifactStore: ArtifactStore | undefined,
): Promise<RefreshedAuditEvidence> {
  let evidence = await readAuditEvidence(audit);
  if (!findingsAreStale(evidence.manifest.findingsProvenance, evidence.findings)) {
    return { ...evidence, findingsWereRefreshed: false };
  }

  await renormalizeAudit(evidence.auditDir, artifactStore);
  await backfillAuditRow(evidence.auditDir, connection);
  await syncAuditDirToBucket(
    artifactStore,
    evidence.auditDir,
    new URL(audit.siteUrl).hostname,
    audit.startedAt,
  );
  evidence = await readAuditEvidence(audit);
  return { ...evidence, findingsWereRefreshed: true };
}
