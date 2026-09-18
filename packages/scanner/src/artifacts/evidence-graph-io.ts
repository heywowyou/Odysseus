/**
 * Atomic persistence for the Plan 059 evidence roots.
 *
 * Raw evidence and approval metadata are private audit artifacts. Writing each
 * file through a same-directory temporary file prevents a process crash from
 * leaving valid-looking half JSON at the canonical path.
 */
import fs from 'node:fs';
import path from 'node:path';
import { canonicalDigest, type ApprovedAuditEvidence } from '@odysseus/core';
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
const PAGE_SEMANTIC_PROFILES_FILENAME = 'page-semantic-profiles.json';
const PATTERN_EVIDENCE_FILENAME = 'pattern-evidence.json';

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
    throw new Error('approveAuditEvidence: legacy adapter approval is not canonical evidence');
  }
  if (approval.auditId !== raw.auditId || approval.auditId !== audit.auditId) {
    throw new Error('approveAuditEvidence: approval and evidence roots name different audits');
  }
  if (
    approval.evidenceEpoch !== raw.evidenceEpoch ||
    approval.evidenceEpoch !== audit.evidenceEpoch ||
    approval.evidenceEpoch !== quality.evidenceEpoch
  ) {
    throw new Error('approveAuditEvidence: approval and roots name different evidence epochs');
  }
  if (approval.rawEvidenceSnapshotDigest !== raw.digest) {
    throw new Error('approveAuditEvidence: approval references a different raw evidence root');
  }
  if (approval.auditEvidenceSnapshotDigest !== audit.digest) {
    throw new Error('approveAuditEvidence: approval references a different audit evidence root');
  }
  if (approval.evidenceQualityAssessmentDigest !== quality.digest) {
    throw new Error('approveAuditEvidence: approval references a different quality assessment');
  }
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
 * Whether this audit directory carries an assembled evidence graph, judged
 * by the presence of its quality assessment alone. Plan 060's operator
 * projections need exactly this fact and nothing else: no evidence payload,
 * no report bytes. `writeAuditEvidenceGraph` writes the assessment only
 * when a run actually assembled and assessed the graph, so its presence is
 * the honest assessed marker.
 */
export function hasAssessedEvidenceGraph(auditDir: string): boolean {
  return fs.existsSync(
    path.join(auditDir, EVIDENCE_GRAPH_DIRNAME, EVIDENCE_QUALITY_ASSESSMENT_FILENAME),
  );
}

/**
 * Persists a whole assembled graph without its approval. The supporting
 * ledgers the raw root digests are written first, then the roots. Any
 * approval left by an earlier run of the same audit directory is removed
 * first, because it approved evidence this run has just re-assessed; a
 * current approval is written only by `approveAuditEvidence`, once the
 * persisted roots have been read back.
 */
export function writeAuditEvidenceGraph(auditDir: string, graph: AuditEvidenceGraph): void {
  const evidenceDir = path.join(auditDir, EVIDENCE_GRAPH_DIRNAME);
  fs.rmSync(path.join(evidenceDir, APPROVED_AUDIT_EVIDENCE_FILENAME), { force: true });
  const consistency = runEvidenceConsistencyGate(graph);
  if (!consistency.passed) {
    throw new Error(
      `writeAuditEvidenceGraph: consistency gate failed: ${consistency.violations
        .map((violation) => violation.code)
        .join(', ')}`,
    );
  }
  writeJsonAtomic(path.join(evidenceDir, CHECK_ATTEMPT_LEDGER_FILENAME), graph.attemptLedger);
  writeJsonAtomic(path.join(evidenceDir, EVIDENCE_COVERAGE_LEDGER_FILENAME), graph.coverage);
  writeJsonAtomic(path.join(evidenceDir, READINESS_RECORDS_FILENAME), graph.readinessRecords);
  writeJsonAtomic(path.join(evidenceDir, FRAME_COVERAGE_RECORDS_FILENAME), graph.frameRecords);
  writeJsonAtomic(path.join(evidenceDir, AUDIT_SIGNALS_FILENAME), graph.signals);
  writeJsonAtomic(path.join(evidenceDir, PAGE_SEMANTIC_PROFILES_FILENAME), graph.semanticProfiles);
  writeJsonAtomic(path.join(evidenceDir, PATTERN_EVIDENCE_FILENAME), graph.patterns);
  writeJsonAtomic(path.join(evidenceDir, RAW_EVIDENCE_SNAPSHOT_FILENAME), graph.raw);
  writeJsonAtomic(path.join(evidenceDir, OBSERVATION_LEDGER_FILENAME), graph.observations);
  writeJsonAtomic(path.join(evidenceDir, AUDIT_EVIDENCE_SNAPSHOT_FILENAME), graph.audit);
  writeJsonAtomic(path.join(evidenceDir, EVIDENCE_QUALITY_ASSESSMENT_FILENAME), graph.quality);
}

/** The evidence files, relative to the audit directory, that a reader must
 *  get back byte for byte before an approval may stand next to them. */
export const EVIDENCE_READ_BACK_PATHS: readonly string[] = [
  CHECK_ATTEMPT_LEDGER_FILENAME,
  EVIDENCE_COVERAGE_LEDGER_FILENAME,
  READINESS_RECORDS_FILENAME,
  FRAME_COVERAGE_RECORDS_FILENAME,
  AUDIT_SIGNALS_FILENAME,
  PAGE_SEMANTIC_PROFILES_FILENAME,
  PATTERN_EVIDENCE_FILENAME,
  RAW_EVIDENCE_SNAPSHOT_FILENAME,
  OBSERVATION_LEDGER_FILENAME,
  AUDIT_EVIDENCE_SNAPSHOT_FILENAME,
  EVIDENCE_QUALITY_ASSESSMENT_FILENAME,
].map((name) => path.join(EVIDENCE_GRAPH_DIRNAME, name));

/** The approval file, relative to the audit directory. */
export const APPROVED_AUDIT_EVIDENCE_PATH = path.join(
  EVIDENCE_GRAPH_DIRNAME,
  APPROVED_AUDIT_EVIDENCE_FILENAME,
);

/** The two digest roots an approval references, relative to the audit
 *  directory, so a dashboard reader names the same files the writer wrote
 *  instead of duplicating the paths. */
export const AUDIT_EVIDENCE_SNAPSHOT_PATH = path.join(
  EVIDENCE_GRAPH_DIRNAME,
  AUDIT_EVIDENCE_SNAPSHOT_FILENAME,
);
export const EVIDENCE_QUALITY_ASSESSMENT_PATH = path.join(
  EVIDENCE_GRAPH_DIRNAME,
  EVIDENCE_QUALITY_ASSESSMENT_FILENAME,
);

/** Whether a persisted root is the one assembled, compared as JSON so the
 *  check reads what a later consumer will read. */
function readsBackAs(filePath: string, expected: unknown): boolean {
  const persisted = readJson<unknown>(filePath);
  return (
    persisted !== undefined &&
    canonicalDigest(persisted) === canonicalDigest(JSON.parse(JSON.stringify(expected)))
  );
}

/**
 * Plan 059 step 38: writes the graph's approval, but only after every root it
 * approves reads back from disk exactly as assembled, and verifies the
 * approval itself the same way. Throws, leaving no approval, otherwise. The
 * caller verifies any remote copy before calling this.
 */
export function approveAuditEvidence(auditDir: string, graph: AuditEvidenceGraph): void {
  const approval = graph.approval;
  if (approval === undefined) {
    throw new Error('approveAuditEvidence: the graph carries no approval');
  }
  const roots = { ...graph, approval };
  assertApprovalMatchesRoots(roots);
  const evidenceDir = path.join(auditDir, EVIDENCE_GRAPH_DIRNAME);
  // Every evidence file writeAuditEvidenceGraph persisted, not just the six
  // digest roots: the readiness, frame and signal ledgers are digest-bound in
  // the raw root, so a local edit to them must block approval exactly where
  // no artifact store exists to catch it on the bucket path.
  const persistedRoots: [string, unknown][] = [
    [CHECK_ATTEMPT_LEDGER_FILENAME, graph.attemptLedger],
    [EVIDENCE_COVERAGE_LEDGER_FILENAME, graph.coverage],
    [READINESS_RECORDS_FILENAME, graph.readinessRecords],
    [FRAME_COVERAGE_RECORDS_FILENAME, graph.frameRecords],
    [AUDIT_SIGNALS_FILENAME, graph.signals],
    [PAGE_SEMANTIC_PROFILES_FILENAME, graph.semanticProfiles],
    [PATTERN_EVIDENCE_FILENAME, graph.patterns],
    [RAW_EVIDENCE_SNAPSHOT_FILENAME, graph.raw],
    [OBSERVATION_LEDGER_FILENAME, graph.observations],
    [AUDIT_EVIDENCE_SNAPSHOT_FILENAME, graph.audit],
    [EVIDENCE_QUALITY_ASSESSMENT_FILENAME, graph.quality],
  ];
  for (const [name, expected] of persistedRoots) {
    if (!readsBackAs(path.join(evidenceDir, name), expected)) {
      throw new Error(`approveAuditEvidence: ${name} does not read back as assembled`);
    }
  }
  const approvalPath = path.join(evidenceDir, APPROVED_AUDIT_EVIDENCE_FILENAME);
  writeJsonAtomic(approvalPath, approval);
  if (!readsBackAs(approvalPath, approval)) {
    fs.rmSync(approvalPath, { force: true });
    throw new Error('approveAuditEvidence: the approval does not read back as written');
  }
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
