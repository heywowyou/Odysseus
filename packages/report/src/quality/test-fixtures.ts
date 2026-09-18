/**
 * Hand-built deterministic fixtures for the Plan 058 report-quality modules.
 * Named without .test.ts so Vitest's unit glob does not pick it up as a
 * suite, matching packages/report/src/test-fixtures.ts's convention. These
 * prove the fail-closed guards against minimal, fully-typed shapes; the
 * manifest is the only object stubbed with a cast, because the dossier
 * contract reads exactly three scalar fields from it.
 */

import type {
  ApprovedAuditEvidence,
  ApprovedAuditEvidencePayload,
  AuditManifest,
  CoverageLedger,
  EvidenceLimitation,
  Finding,
  PatternEvidence,
  ReportInputSnapshot,
  SeniorRemediationProject,
  SeniorReportPlan,
  Sha256Digest,
} from '@odysseus/core';
import { FINDINGS_SCHEMA_VERSION } from '@odysseus/core';
import { reportQualityDigest } from './digest.js';

const asDigest = (hex: string): Sha256Digest => `sha256:${hex}`;
export const EVIDENCE_SNAPSHOT_HEX = 'a'.repeat(64);
export const OTHER_DIGEST: Sha256Digest = asDigest('b'.repeat(64));

export interface FindingSpec {
  findingId: string;
  category: Finding['category'];
  severity: Finding['severity'];
  pageUrls?: string[];
  ruleId?: string;
}

export function buildFinding(spec: FindingSpec): Finding {
  return {
    findingId: spec.findingId,
    auditId: 'audit-058',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    source: 'axe',
    ruleId: spec.ruleId ?? 'color-contrast',
    category: spec.category,
    severity: spec.severity,
    wcagCriteria: [],
    title: `Fixture finding ${spec.findingId}`,
    description: 'Deterministic fixture description.',
    pageUrls: spec.pageUrls ?? ['https://site.test/', 'https://site.test/contact'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: `dedupe:${spec.findingId}`,
    firstSeenAt: new Date(0),
    lastSeenAt: new Date(0),
  };
}

export function buildLimitation(
  overrides: Partial<EvidenceLimitation> & Pick<EvidenceLimitation, 'limitationId'>,
): EvidenceLimitation {
  return {
    code: `code-${overrides.limitationId}`,
    summary: {
      fr: `Limite ${overrides.limitationId}`,
      en: `Limitation ${overrides.limitationId}`,
    },
    reportDestination: `methodology#${overrides.limitationId}`,
    evidenceRefs: [],
    ...overrides,
  };
}

export interface PayloadOptions {
  patternEvidence?: PatternEvidence[];
  mandatoryDisclosures?: EvidenceLimitation[];
}

export function buildApproval(
  auditId: string,
  overrides?: Partial<Omit<ApprovedAuditEvidence, 'auditId'>>,
): ApprovedAuditEvidence {
  return {
    auditId,
    evidenceEpoch: 3,
    rawEvidenceSnapshotDigest: asDigest('c'.repeat(64)),
    auditEvidenceSnapshotDigest: asDigest(EVIDENCE_SNAPSHOT_HEX),
    evidenceQualityAssessmentDigest: asDigest('d'.repeat(64)),
    verdict: 'reportable-complete',
    limitations: [],
    evidenceCoverageSignature: {
      digest: asDigest('e'.repeat(64)),
      scopeSignature: asDigest('f'.repeat(64)),
      checkRegistryVersion: 'checks-test',
      surfaceRegistryVersion: 'surfaces-test',
      capabilityRegistryVersion: 'capabilities-test',
      normalizationContract: 'normalization-test',
    },
    capabilityRegistryVersion: 'capabilities-test',
    approvalMode: 'operator',
    approvedAt: new Date(0).toISOString(),
    approvedBySystemVersion: '058-test',
    ...overrides,
  };
}

export function buildPayload(
  findings: Finding[],
  options?: PayloadOptions,
): ApprovedAuditEvidencePayload {
  return {
    approval: buildApproval('audit-058'),
    manifest: {
      auditId: 'audit-058',
      siteUrl: 'https://site.test',
      crawl: { visitedCount: 12 },
    } as unknown as AuditManifest,
    findings,
    ...(options?.patternEvidence ? { patternEvidence: options.patternEvidence } : {}),
    ...(options?.mandatoryDisclosures
      ? { mandatoryDisclosures: options.mandatoryDisclosures }
      : { mandatoryDisclosures: [] }),
  };
}

export function buildSnapshot(
  payload: ApprovedAuditEvidencePayload,
  overrides?: Partial<Omit<ReportInputSnapshot, 'approvedEvidenceDigest'>>,
): ReportInputSnapshot {
  return {
    snapshotVersion: '058-test',
    auditId: 'audit-058',
    approvedEvidenceDigest: reportQualityDigest(payload.approval),
    evidenceQualityAssessmentDigest: payload.approval.evidenceQualityAssessmentDigest,
    auditIdentityDigest: asDigest('1'.repeat(64)),
    reportOnlyInputsDigest: asDigest('2'.repeat(64)),
    referenceRegistryDigest: asDigest('3'.repeat(64)),
    reportTemplateVersion: 12,
    rendererBuild: '058-test-build',
    rendererFingerprint: asDigest('4'.repeat(64)),
    fontFingerprint: asDigest('5'.repeat(64)),
    modelProfileDigest: asDigest('6'.repeat(64)),
    qualityToolFingerprint: asDigest('7'.repeat(64)),
    requestedLanguages: ['fr', 'en'],
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

export function buildProject(
  overrides: Partial<SeniorRemediationProject> &
    Pick<SeniorRemediationProject, 'projectKey' | 'findingIds'>,
): SeniorRemediationProject {
  return {
    category: 'accessibility',
    evidenceRefs: [],
    factRefs: [],
    impact: 'high',
    effort: 'low',
    rationale: 'Deterministic fixture rationale.',
    dependencies: [],
    sharedDependencies: [],
    ...overrides,
  };
}

export function buildPlan(
  remediationProjects: SeniorRemediationProject[],
  executivePriorityKeys: string[],
): SeniorReportPlan {
  return {
    planVersion: '058-test',
    inputSnapshotDigest: asDigest('8'.repeat(64)),
    remediationProjects,
    executivePriorityKeys,
  };
}

/** A coverage ledger identical to what buildInitialCoverageLedger derives
 *  from `payload`, for tests that need to tamper with specific entries. */
export function ledgerSnapshotOf(payload: ApprovedAuditEvidencePayload): CoverageLedger {
  return {
    inputSnapshotDigest: reportQualityDigest(payload.approval),
    entries: payload.findings.map((finding) => ({
      findingId: finding.findingId,
      severity: finding.severity,
      eligible: finding.severity !== 'minor',
      disposition: finding.severity === 'minor' ? 'appendix-only' : 'unassigned',
    })),
  };
}
