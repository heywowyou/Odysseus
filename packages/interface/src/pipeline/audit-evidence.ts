/**
 * Shared on-disk evidence reader for the preparation workflow: the audit's
 * manifest.json and findings.json artifacts. Journey evidence and hook
 * resolution read these files rather than the Mongo audit document, whose
 * schema deliberately does not persist `siteSignals` (trade-off 62).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AuditManifest, Finding } from '@odysseus/core';
import type { AuditDocument } from '@odysseus/store';
import { buildAuditDir, getArtifactsRoot } from '@odysseus/scanner';
import { RegenerationConflictError } from './regenerate-writing.js';

export interface AuditEvidence {
  auditDir: string;
  manifest: AuditManifest;
  findings: Finding[];
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
