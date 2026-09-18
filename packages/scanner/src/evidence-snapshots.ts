/**
 * Content-addressed evidence roots and fail-closed approval for Plan 059.
 *
 * This file deliberately does not normalize findings. It binds already
 * acquired/accepted evidence into immutable roots, checks lineage consistency,
 * classifies evidence quality, and produces the small envelope Plan 058 is
 * allowed to consume.
 */
import {
  canonicalDigest,
  type ApprovedAuditEvidence,
  type EvidenceCoverageSignature as ReportEvidenceCoverageSignature,
  type EvidenceLimitation,
  type Sha256Digest,
} from '@odysseus/core';
import type { ObservationLedger } from './evidence-ledger.js';

export const RAW_EVIDENCE_SNAPSHOT_VERSION = 'raw-evidence-snapshot-v1';
export const AUDIT_EVIDENCE_SNAPSHOT_VERSION = 'audit-evidence-snapshot-v1';
export const EVIDENCE_QUALITY_ASSESSMENT_VERSION = 'evidence-quality-assessment-v1';
export const EVIDENCE_CONSISTENCY_GATE_VERSION = 'evidence-consistency-gate-v1';

function digest(value: unknown): Sha256Digest {
  return canonicalDigest(value) as Sha256Digest;
}

function requireDigest(value: string, field: string): Sha256Digest {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`${field}: expected sha256 digest`);
  }
  return value as Sha256Digest;
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export type TemporalCoherenceResult =
  | { status: 'coherent'; startedAt: string; finishedAt: string }
  | {
      status: 'drift-detected';
      startedAt: string;
      finishedAt: string;
      materialTargets: readonly string[];
      evidenceRefs: readonly string[];
    }
  | { status: 'unknown'; reasonCode: string };

export interface RawEvidenceSnapshotInput {
  auditId: string;
  evidenceEpoch: number;
  scopeDigest: string;
  networkPolicyDigest: string;
  robotsPolicyDigest: string;
  inventoryDigest: string;
  /** Complete append-only ledger, including failed/rejected/superseded attempts. */
  attemptLedgerDigest: string;
  acceptedArtifactDigests: readonly string[];
  evidenceCoverageLedgerDigest: string;
  readinessRecordDigests: readonly string[];
  frameCoverageRecordDigests: readonly string[];
  environmentFingerprintDigest: string;
  configFingerprintDigest: string;
  temporalCoherence: TemporalCoherenceResult;
}

export interface RawEvidenceSnapshot extends Omit<RawEvidenceSnapshotInput, 'temporalCoherence'> {
  version: typeof RAW_EVIDENCE_SNAPSHOT_VERSION;
  temporalCoherence: TemporalCoherenceResult;
  digest: Sha256Digest;
}

export function buildRawEvidenceSnapshot(input: RawEvidenceSnapshotInput): RawEvidenceSnapshot {
  const body = {
    ...input,
    acceptedArtifactDigests: uniqueSorted(input.acceptedArtifactDigests),
    readinessRecordDigests: uniqueSorted(input.readinessRecordDigests),
    frameCoverageRecordDigests: uniqueSorted(input.frameCoverageRecordDigests),
    temporalCoherence:
      input.temporalCoherence.status === 'drift-detected'
        ? {
            ...input.temporalCoherence,
            materialTargets: uniqueSorted(input.temporalCoherence.materialTargets),
            evidenceRefs: uniqueSorted(input.temporalCoherence.evidenceRefs),
          }
        : input.temporalCoherence,
    version: RAW_EVIDENCE_SNAPSHOT_VERSION,
  } as const;
  return { ...body, digest: digest(body) };
}

export function verifyRawEvidenceSnapshot(snapshot: RawEvidenceSnapshot): boolean {
  const { digest: stored, ...body } = snapshot;
  return digest(body) === stored;
}

export interface AuditEvidenceSnapshotInput {
  auditId: string;
  evidenceEpoch: number;
  rawEvidenceSnapshotDigest: string;
  observationLedgerDigest: string;
  confirmedFindingsDigest: string;
  signalsDigest: string;
  pageSemanticProfilesDigest: string;
  patternEvidenceDigest: string;
  capabilityRegistryVersion: string;
  capabilityRegistryDigest: string;
  evidenceCoverageSignature: ReportEvidenceCoverageSignature;
}

export interface AuditEvidenceSnapshot extends AuditEvidenceSnapshotInput {
  version: typeof AUDIT_EVIDENCE_SNAPSHOT_VERSION;
  digest: Sha256Digest;
}

export function buildAuditEvidenceSnapshot(
  input: AuditEvidenceSnapshotInput,
): AuditEvidenceSnapshot {
  const body = { ...input, version: AUDIT_EVIDENCE_SNAPSHOT_VERSION } as const;
  return { ...body, digest: digest(body) };
}

export type EvidenceQualityReasonCode =
  | 'raw-evidence-invalid'
  | 'inventory-unreconciled'
  | 'unresolved-material-gap'
  | 'unstable-material-result'
  | 'temporal-drift'
  | 'performance-confidence-insufficient'
  | 'capability-gap-undisclosed'
  | 'site-level-unknown'
  | 'robots-policy-unresolved'
  | 'network-safety-preflight-failed'
  | 'environment-unapproved'
  | 'consistency-gate-failed'
  | 'operator-resolution-required'
  | 'legacy-evidence-insufficient';

export interface EvidenceQualityIssue {
  code: EvidenceQualityReasonCode;
  severity: 'blocking' | 'limitation';
  resolution: 'system' | 'operator' | 'impossible';
  summary: string;
  evidenceRefs: readonly string[];
  disclosure?: EvidenceLimitation;
}

export type EvidenceQualityVerdict =
  'reportable-complete' | 'reportable-with-known-limitations' | 'needs-operator-review' | 'failed';

export interface EvidenceQualityAssessmentInput {
  auditId: string;
  evidenceEpoch: number;
  auditEvidenceSnapshotDigest: string;
  issues: readonly EvidenceQualityIssue[];
}

export interface EvidenceQualityAssessment extends Omit<EvidenceQualityAssessmentInput, 'issues'> {
  version: typeof EVIDENCE_QUALITY_ASSESSMENT_VERSION;
  issues: readonly EvidenceQualityIssue[];
  mandatoryDisclosures: readonly EvidenceLimitation[];
  verdict: EvidenceQualityVerdict;
  digest: Sha256Digest;
}

export function buildEvidenceQualityAssessment(
  input: EvidenceQualityAssessmentInput,
): EvidenceQualityAssessment {
  const issues = [...input.issues]
    .map((issue) => ({ ...issue, evidenceRefs: uniqueSorted(issue.evidenceRefs) }))
    .sort((a, b) => {
      const byCode = a.code.localeCompare(b.code);
      return byCode === 0 ? a.summary.localeCompare(b.summary) : byCode;
    });
  const blockers = issues.filter((issue) => issue.severity === 'blocking');
  const verdict: EvidenceQualityVerdict = blockers.some(
    (issue) => issue.resolution === 'impossible' || issue.resolution === 'system',
  )
    ? 'failed'
    : blockers.length > 0
      ? 'needs-operator-review'
      : issues.length > 0
        ? 'reportable-with-known-limitations'
        : 'reportable-complete';

  const mandatoryDisclosures = issues
    .map((issue) => issue.disclosure)
    .filter((value): value is EvidenceLimitation => value !== undefined)
    .sort((a, b) => a.limitationId.localeCompare(b.limitationId));

  if (verdict === 'reportable-with-known-limitations' && mandatoryDisclosures.length === 0) {
    throw new Error(
      'buildEvidenceQualityAssessment: a reportable limitation requires a mandatory disclosure',
    );
  }

  const body = {
    auditId: input.auditId,
    evidenceEpoch: input.evidenceEpoch,
    auditEvidenceSnapshotDigest: input.auditEvidenceSnapshotDigest,
    version: EVIDENCE_QUALITY_ASSESSMENT_VERSION,
    issues,
    mandatoryDisclosures,
    verdict,
  } as const;
  return { ...body, digest: digest(body) };
}

export type EvidenceConsistencyViolationCode =
  | 'raw-snapshot-digest-invalid'
  | 'audit-id-mismatch'
  | 'evidence-epoch-mismatch'
  | 'observation-root-mismatch'
  | 'audit-observation-ledger-mismatch'
  | 'audit-root-mismatch'
  | 'quality-identity-mismatch'
  | 'quality-root-mismatch';

export interface EvidenceConsistencyViolation {
  code: EvidenceConsistencyViolationCode;
  detail: string;
}

export interface EvidenceConsistencyGateResult {
  version: typeof EVIDENCE_CONSISTENCY_GATE_VERSION;
  passed: boolean;
  violations: readonly EvidenceConsistencyViolation[];
  digest: Sha256Digest;
}

export interface EvidenceConsistencyGateInput {
  raw: RawEvidenceSnapshot;
  observations: ObservationLedger;
  audit: AuditEvidenceSnapshot;
  quality?: EvidenceQualityAssessment;
}

export function runEvidenceConsistencyGate(
  input: EvidenceConsistencyGateInput,
): EvidenceConsistencyGateResult {
  const violations: EvidenceConsistencyViolation[] = [];
  if (!verifyRawEvidenceSnapshot(input.raw)) {
    violations.push({
      code: 'raw-snapshot-digest-invalid',
      detail: 'Raw evidence snapshot content does not match its stored digest.',
    });
  }
  if (input.audit.auditId !== input.raw.auditId) {
    violations.push({
      code: 'audit-id-mismatch',
      detail: 'Audit root and raw root name different audits.',
    });
  }
  if (
    input.audit.evidenceEpoch !== input.raw.evidenceEpoch ||
    input.observations.evidenceEpoch !== input.raw.evidenceEpoch
  ) {
    violations.push({
      code: 'evidence-epoch-mismatch',
      detail: 'Raw, observation and audit roots do not belong to one evidence epoch.',
    });
  }
  if (input.observations.rawEvidenceSnapshotDigest !== input.raw.digest) {
    violations.push({
      code: 'observation-root-mismatch',
      detail: 'Observation ledger was not derived from this raw evidence root.',
    });
  }
  if (input.audit.observationLedgerDigest !== input.observations.digest) {
    violations.push({
      code: 'audit-observation-ledger-mismatch',
      detail: 'Audit evidence snapshot references a different observation ledger.',
    });
  }
  if (input.audit.rawEvidenceSnapshotDigest !== input.raw.digest) {
    violations.push({
      code: 'audit-root-mismatch',
      detail: 'Audit evidence snapshot references a different raw evidence root.',
    });
  }
  if (
    input.quality !== undefined &&
    (input.quality.auditId !== input.audit.auditId ||
      input.quality.evidenceEpoch !== input.audit.evidenceEpoch)
  ) {
    violations.push({
      code: 'quality-identity-mismatch',
      detail: 'Evidence quality assessment names a different audit or evidence epoch.',
    });
  }
  if (
    input.quality !== undefined &&
    input.quality.auditEvidenceSnapshotDigest !== input.audit.digest
  ) {
    violations.push({
      code: 'quality-root-mismatch',
      detail: 'Evidence quality assessment references a different audit evidence root.',
    });
  }
  const body = {
    version: EVIDENCE_CONSISTENCY_GATE_VERSION,
    passed: violations.length === 0,
    violations,
  } as const;
  return { ...body, digest: digest(body) };
}

export interface ProduceApprovedAuditEvidenceInput {
  audit: AuditEvidenceSnapshot;
  raw: RawEvidenceSnapshot;
  assessment: EvidenceQualityAssessment;
  approvalMode: 'system' | 'operator';
  approvedAt: string;
  approvedBySystemVersion: string;
  operatorDecisionId?: string;
  operatorDecisionDigest?: string;
}

export interface ProducedApprovedAuditEvidence extends ApprovedAuditEvidence {
  operatorDecisionId?: string;
  operatorDecisionDigest?: Sha256Digest;
}

export function produceApprovedAuditEvidence(
  input: ProduceApprovedAuditEvidenceInput,
): ProducedApprovedAuditEvidence {
  if (
    input.assessment.verdict !== 'reportable-complete' &&
    input.assessment.verdict !== 'reportable-with-known-limitations'
  ) {
    throw new Error(
      `produceApprovedAuditEvidence: evidence verdict ${input.assessment.verdict} is not reportable`,
    );
  }
  if (
    input.assessment.auditId !== input.audit.auditId ||
    input.assessment.evidenceEpoch !== input.audit.evidenceEpoch
  ) {
    throw new Error(
      'produceApprovedAuditEvidence: assessment names another audit or evidence epoch',
    );
  }
  if (input.assessment.auditEvidenceSnapshotDigest !== input.audit.digest) {
    throw new Error('produceApprovedAuditEvidence: assessment does not approve this audit root');
  }
  if (input.audit.rawEvidenceSnapshotDigest !== input.raw.digest) {
    throw new Error('produceApprovedAuditEvidence: audit root does not reference this raw root');
  }
  if (input.approvalMode === 'operator') {
    if (input.operatorDecisionId === undefined || input.operatorDecisionDigest === undefined) {
      throw new Error(
        'produceApprovedAuditEvidence: operator approval requires decision provenance',
      );
    }
  } else if (input.operatorDecisionId !== undefined || input.operatorDecisionDigest !== undefined) {
    throw new Error(
      'produceApprovedAuditEvidence: system approval cannot carry operator provenance',
    );
  }

  return {
    auditId: input.audit.auditId,
    evidenceEpoch: input.audit.evidenceEpoch,
    rawEvidenceSnapshotDigest: requireDigest(input.raw.digest, 'rawEvidenceSnapshotDigest'),
    auditEvidenceSnapshotDigest: requireDigest(input.audit.digest, 'auditEvidenceSnapshotDigest'),
    evidenceQualityAssessmentDigest: requireDigest(
      input.assessment.digest,
      'evidenceQualityAssessmentDigest',
    ),
    verdict: input.assessment.verdict,
    limitations: [...input.assessment.mandatoryDisclosures],
    evidenceCoverageSignature: input.audit.evidenceCoverageSignature,
    capabilityRegistryVersion: input.audit.capabilityRegistryVersion,
    approvalMode: input.approvalMode,
    approvedAt: input.approvedAt,
    approvedBySystemVersion: input.approvedBySystemVersion,
    ...(input.operatorDecisionId !== undefined
      ? { operatorDecisionId: input.operatorDecisionId }
      : {}),
    ...(input.operatorDecisionDigest !== undefined
      ? {
          operatorDecisionDigest: requireDigest(
            input.operatorDecisionDigest,
            'operatorDecisionDigest',
          ),
        }
      : {}),
  };
}
