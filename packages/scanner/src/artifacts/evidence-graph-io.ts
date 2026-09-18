/**
 * Atomic persistence for the Plan 059 evidence roots.
 *
 * Raw evidence and approval metadata are private audit artifacts. Writing each
 * file through a same-directory temporary file prevents a process crash from
 * leaving valid-looking half JSON at the canonical path.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ApprovedAuditEvidence } from '@odysseus/core';
import type { ObservationLedger } from '../evidence-ledger.js';
import {
  runEvidenceConsistencyGate,
  type AuditEvidenceSnapshot,
  type EvidenceQualityAssessment,
  type RawEvidenceSnapshot,
} from '../evidence-snapshots.js';

export const EVIDENCE_GRAPH_DIRNAME = 'evidence';
export const RAW_EVIDENCE_SNAPSHOT_FILENAME = 'raw-evidence-snapshot.json';
export const OBSERVATION_LEDGER_FILENAME = 'observation-ledger.json';
export const AUDIT_EVIDENCE_SNAPSHOT_FILENAME = 'audit-evidence-snapshot.json';
export const EVIDENCE_QUALITY_ASSESSMENT_FILENAME = 'evidence-quality-assessment.json';
export const APPROVED_AUDIT_EVIDENCE_FILENAME = 'approved-audit-evidence.json';

export interface EvidenceGraphRoots {
  raw: RawEvidenceSnapshot;
  observations: ObservationLedger;
  audit: AuditEvidenceSnapshot;
  quality: EvidenceQualityAssessment;
  approval: ApprovedAuditEvidence;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function assertApprovalMatchesRoots(roots: EvidenceGraphRoots): void {
  const { approval, raw, audit, quality } = roots;
  if (approval.approvalMode === 'legacy-adapter') {
    throw new Error('writeEvidenceGraphRoots: legacy adapter approval is not canonical evidence');
  }
  if (approval.auditId !== raw.auditId || approval.auditId !== audit.auditId) {
    throw new Error('writeEvidenceGraphRoots: approval and evidence roots name different audits');
  }
  if (
    approval.evidenceEpoch !== raw.evidenceEpoch ||
    approval.evidenceEpoch !== audit.evidenceEpoch ||
    approval.evidenceEpoch !== quality.evidenceEpoch
  ) {
    throw new Error('writeEvidenceGraphRoots: approval and roots name different evidence epochs');
  }
  if (approval.rawEvidenceSnapshotDigest !== raw.digest) {
    throw new Error('writeEvidenceGraphRoots: approval references a different raw evidence root');
  }
  if (approval.auditEvidenceSnapshotDigest !== audit.digest) {
    throw new Error('writeEvidenceGraphRoots: approval references a different audit evidence root');
  }
  if (approval.evidenceQualityAssessmentDigest !== quality.digest) {
    throw new Error('writeEvidenceGraphRoots: approval references a different quality assessment');
  }
}

export function writeEvidenceGraphRoots(auditDir: string, roots: EvidenceGraphRoots): void {
  const consistency = runEvidenceConsistencyGate(roots);
  if (!consistency.passed) {
    throw new Error(
      `writeEvidenceGraphRoots: consistency gate failed: ${consistency.violations
        .map((violation) => violation.code)
        .join(', ')}`,
    );
  }
  assertApprovalMatchesRoots(roots);
  const evidenceDir = path.join(auditDir, EVIDENCE_GRAPH_DIRNAME);
  writeJsonAtomic(path.join(evidenceDir, RAW_EVIDENCE_SNAPSHOT_FILENAME), roots.raw);
  writeJsonAtomic(path.join(evidenceDir, OBSERVATION_LEDGER_FILENAME), roots.observations);
  writeJsonAtomic(path.join(evidenceDir, AUDIT_EVIDENCE_SNAPSHOT_FILENAME), roots.audit);
  writeJsonAtomic(path.join(evidenceDir, EVIDENCE_QUALITY_ASSESSMENT_FILENAME), roots.quality);
  writeJsonAtomic(path.join(evidenceDir, APPROVED_AUDIT_EVIDENCE_FILENAME), roots.approval);
}

function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

export function readApprovedAuditEvidence(auditDir: string): ApprovedAuditEvidence | undefined {
  return readJson<ApprovedAuditEvidence>(
    path.join(auditDir, EVIDENCE_GRAPH_DIRNAME, APPROVED_AUDIT_EVIDENCE_FILENAME),
  );
}
