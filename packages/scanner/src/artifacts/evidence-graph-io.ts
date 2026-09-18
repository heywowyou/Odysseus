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
import type { AuditEvidenceGraph } from '../evidence-graph.js';
import type { ObservationLedger } from '../evidence-ledger.js';
import {
  runEvidenceConsistencyGate,
  type AuditEvidenceSnapshot,
  type EvidenceQualityAssessment,
  type RawEvidenceSnapshot,
} from '../evidence-snapshots.js';

export const EVIDENCE_GRAPH_DIRNAME = 'evidence';
const RAW_EVIDENCE_SNAPSHOT_FILENAME = 'raw-evidence-snapshot.json';
const OBSERVATION_LEDGER_FILENAME = 'observation-ledger.json';
const AUDIT_EVIDENCE_SNAPSHOT_FILENAME = 'audit-evidence-snapshot.json';
const EVIDENCE_QUALITY_ASSESSMENT_FILENAME = 'evidence-quality-assessment.json';
const APPROVED_AUDIT_EVIDENCE_FILENAME = 'approved-audit-evidence.json';
const CHECK_ATTEMPT_LEDGER_FILENAME = 'check-attempt-ledger.json';
const EVIDENCE_COVERAGE_LEDGER_FILENAME = 'evidence-coverage-ledger.json';
const READINESS_RECORDS_FILENAME = 'page-readiness-records.json';
const FRAME_COVERAGE_RECORDS_FILENAME = 'frame-coverage-records.json';
const AUDIT_SIGNALS_FILENAME = 'audit-signals.json';

interface EvidenceGraphRoots {
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

function writeEvidenceGraphRoots(auditDir: string, roots: EvidenceGraphRoots): void {
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

/**
 * Persists a whole assembled graph. The supporting ledgers the raw root
 * digests are written first, then the roots. An approval is written only when
 * the graph carries one; otherwise any approval left by an earlier run of the
 * same audit directory is removed, because it approved evidence this run has
 * just re-assessed as not reportable.
 */
export function writeAuditEvidenceGraph(auditDir: string, graph: AuditEvidenceGraph): void {
  const evidenceDir = path.join(auditDir, EVIDENCE_GRAPH_DIRNAME);
  writeJsonAtomic(path.join(evidenceDir, CHECK_ATTEMPT_LEDGER_FILENAME), graph.attemptLedger);
  writeJsonAtomic(path.join(evidenceDir, EVIDENCE_COVERAGE_LEDGER_FILENAME), graph.coverage);
  writeJsonAtomic(path.join(evidenceDir, READINESS_RECORDS_FILENAME), graph.readinessRecords);
  writeJsonAtomic(path.join(evidenceDir, FRAME_COVERAGE_RECORDS_FILENAME), graph.frameRecords);
  writeJsonAtomic(path.join(evidenceDir, AUDIT_SIGNALS_FILENAME), graph.signals);
  // Removed before any root is replaced, so a crash part-way through leaves
  // no approval next to roots it never approved.
  fs.rmSync(path.join(evidenceDir, APPROVED_AUDIT_EVIDENCE_FILENAME), { force: true });
  if (graph.approval !== undefined) {
    writeEvidenceGraphRoots(auditDir, { ...graph, approval: graph.approval });
    return;
  }
  const consistency = runEvidenceConsistencyGate(graph);
  if (!consistency.passed) {
    throw new Error(
      `writeAuditEvidenceGraph: consistency gate failed: ${consistency.violations
        .map((violation) => violation.code)
        .join(', ')}`,
    );
  }
  writeJsonAtomic(path.join(evidenceDir, RAW_EVIDENCE_SNAPSHOT_FILENAME), graph.raw);
  writeJsonAtomic(path.join(evidenceDir, OBSERVATION_LEDGER_FILENAME), graph.observations);
  writeJsonAtomic(path.join(evidenceDir, AUDIT_EVIDENCE_SNAPSHOT_FILENAME), graph.audit);
  writeJsonAtomic(path.join(evidenceDir, EVIDENCE_QUALITY_ASSESSMENT_FILENAME), graph.quality);
}

/**
 * Removes an audit's approval without touching its roots. The pipeline calls
 * this when assembling a fresh graph failed, so an approval from an earlier
 * run of the same directory cannot outlive the evidence it approved.
 */
export function removeApprovedAuditEvidence(auditDir: string): void {
  fs.rmSync(path.join(auditDir, EVIDENCE_GRAPH_DIRNAME, APPROVED_AUDIT_EVIDENCE_FILENAME), {
    force: true,
  });
}

export function readAuditEvidenceSnapshot(auditDir: string): AuditEvidenceSnapshot | undefined {
  return readJson<AuditEvidenceSnapshot>(
    path.join(auditDir, EVIDENCE_GRAPH_DIRNAME, AUDIT_EVIDENCE_SNAPSHOT_FILENAME),
  );
}

export function readEvidenceQualityAssessment(
  auditDir: string,
): EvidenceQualityAssessment | undefined {
  return readJson<EvidenceQualityAssessment>(
    path.join(auditDir, EVIDENCE_GRAPH_DIRNAME, EVIDENCE_QUALITY_ASSESSMENT_FILENAME),
  );
}
