import type { AuditManifest } from './manifest.js';
import type { AuditManualFields } from './manual-fields.js';
import type { Finding, FindingCategory } from './findings.js';
import type { ReportLanguage } from './llm-output.js';
import type { FindingsDelta } from '../delta/findings-delta.js';
import type { GradeOverride } from '../grade.js';
import type { ObligationAssessment } from './compliance.js';
import type { PreparationPreviewLanguage } from '../report-preparation/preview.js';

export type Sha256Digest = `sha256:${string}`;

export type ReportBundleState =
  | 'running'
  | 'content-clean'
  | 'fr-candidate-clean'
  | 'en-candidate-clean'
  | 'parity-clean'
  | 'bundle-final-review'
  | 'quality-approved'
  | 'awaiting-operator-approval'
  | 'operator-approved'
  | 'promoted'
  | 'needs-operator-review'
  | 'failed';

export type ReportQualityRole =
  | 'senior-analyst'
  | 'writer-fr'
  | 'writer-en'
  | 'content-critic-evidence'
  | 'content-critic-editorial'
  | 'issue-adjudicator'
  | 'editor'
  | 'visual-reviewer-physical'
  | 'visual-reviewer-design'
  | 'visual-issue-adjudicator'
  | 'parity-reviewer'
  | 'final-visual-reviewer'
  | 'final-document-arbiter';

export interface EvidenceLimitation {
  limitationId: string;
  code: string;
  summary: Record<ReportLanguage, string>;
  reportDestination: string;
  evidenceRefs: string[];
}

export interface EvidenceCoverageSignature {
  digest: Sha256Digest;
  scopeSignature: Sha256Digest;
  checkRegistryVersion: string;
  surfaceRegistryVersion: string;
  capabilityRegistryVersion: string;
  normalizationContract: string;
  semanticClassifierVersion?: string;
}

export interface ApprovedAuditEvidence {
  auditId: string;
  evidenceEpoch: number;
  rawEvidenceSnapshotDigest: Sha256Digest;
  auditEvidenceSnapshotDigest: Sha256Digest;
  evidenceQualityAssessmentDigest: Sha256Digest;
  verdict: 'reportable-complete' | 'reportable-with-known-limitations';
  limitations: EvidenceLimitation[];
  evidenceCoverageSignature: EvidenceCoverageSignature;
  capabilityRegistryVersion: string;
  approvalMode: 'system' | 'operator' | 'legacy-adapter';
  approvedAt: string;
  approvedBySystemVersion: string;
}

export interface PatternEvidence {
  patternId: string;
  title: string;
  findingIds: string[];
  evidenceRefs: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface ApprovedAuditEvidencePayload {
  approval: ApprovedAuditEvidence;
  manifest: AuditManifest;
  findings: Finding[];
  patternEvidence?: PatternEvidence[];
  mandatoryDisclosures: EvidenceLimitation[];
}

export interface ReportOnlyInputs {
  manualFields?: AuditManualFields;
  gradeOverride?: GradeOverride;
  obligationAssessment?: ObligationAssessment;
  preparation: Record<ReportLanguage, PreparationPreviewLanguage>;
  delta?: FindingsDelta;
}

export interface ReportInputSnapshot {
  snapshotVersion: string;
  auditId: string;
  approvedEvidenceDigest: Sha256Digest;
  evidenceQualityAssessmentDigest: Sha256Digest;
  auditIdentityDigest: Sha256Digest;
  reportOnlyInputsDigest: Sha256Digest;
  referenceRegistryDigest: Sha256Digest;
  reportTemplateVersion: number;
  rendererBuild: string;
  rendererFingerprint: Sha256Digest;
  fontFingerprint: Sha256Digest;
  modelProfileDigest: Sha256Digest;
  qualityToolFingerprint: Sha256Digest;
  requestedLanguages: ReportLanguage[];
  createdAt: string;
}

export type EvidenceBoundSegment =
  | { kind: 'text'; text: string }
  | { kind: 'fact'; factId: string; format?: string | undefined }
  | { kind: 'reference'; referenceId: string };

export interface EvidenceBoundContent {
  segments: EvidenceBoundSegment[];
}

export interface ReportFact {
  factId: string;
  kind: 'number' | 'url' | 'date' | 'identifier' | 'status' | 'reference' | 'text';
  value: string | number | boolean | null;
  display: Record<ReportLanguage, string>;
  sourceRefs: string[];
}

export interface ReportFactRegistry {
  registryVersion: string;
  inputSnapshotDigest: Sha256Digest;
  facts: ReportFact[];
}

export interface EvidencePacket {
  packetId: string;
  category: FindingCategory;
  findingIds: string[];
  representativeEvidenceRefs: string[];
}

export interface CoverageLedgerEntry {
  findingId: string;
  severity: Finding['severity'];
  eligible: boolean;
  disposition: 'unassigned' | 'project' | 'appendix-only';
  projectKey?: string;
}

export interface CoverageLedger {
  inputSnapshotDigest: Sha256Digest;
  entries: CoverageLedgerEntry[];
}

export interface ReportEvidenceDossier {
  inputSnapshotDigest: Sha256Digest;
  packets: EvidencePacket[];
  patterns: PatternEvidence[];
  coverageLedger: CoverageLedger;
}

export interface SeniorRemediationProject {
  projectKey: string;
  category: FindingCategory;
  findingIds: string[];
  evidenceRefs: string[];
  factRefs: string[];
  likelyRootCause?: {
    text: string;
    confidence: 'high' | 'medium' | 'low';
    inference: true;
  };
  conditionality?: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  rationale: string;
  dependencies: string[];
  sharedDependencies: string[];
}

export interface SeniorReportPlan {
  planVersion: string;
  inputSnapshotDigest: Sha256Digest;
  remediationProjects: SeniorRemediationProject[];
  executivePriorityKeys: string[];
}

export type ReviewIssueKind = 'objective-defect' | 'preference';
export type ReviewIssueStatus = 'proposed' | 'accepted' | 'rejected' | 'unsure';
export type ReviewRepairRoute =
  | 'recompute-report-fact'
  | 'upstream-evidence-defect'
  | 'patch-plan'
  | 'patch-prose'
  | 'layout-hint'
  | 'rerender'
  | 'template-defect';

export interface ReviewIssue {
  issueId: string;
  kind: ReviewIssueKind;
  severity: 'blocking' | 'major' | 'minor';
  target: string;
  domain: string;
  supportingRefs: string[];
  reason: string;
  repairRoute: ReviewRepairRoute;
  status: ReviewIssueStatus;
  sourceRole: ReportQualityRole;
  artifactDigest: Sha256Digest;
}

export type ReportQualityReasoningEffort = 'high' | 'xhigh';

export interface ReportQualityModelCall {
  role: ReportQualityRole;
  profileId: string;
  profileDigest: Sha256Digest;
  requestedModel: string;
  resolvedModel: string;
  providerFingerprint?: string;
  reasoningEffort: ReportQualityReasoningEffort;
  promptDigest: Sha256Digest;
  schemaDigest: Sha256Digest;
}

export interface ReportBundleCandidate {
  qualityRunId: string;
  epoch: number;
  inputSnapshotDigest: Sha256Digest;
  approvedEvidenceDigest: Sha256Digest;
  seniorPlanDigest: Sha256Digest;
  frCandidateDigest: Sha256Digest;
  enCandidateDigest: Sha256Digest;
  parityVerdictDigest: Sha256Digest;
  finalArbiterVerdictDigest: Sha256Digest;
  bundleManifestDigest: Sha256Digest;
  state: 'quality-approved';
  bundleDigest: Sha256Digest;
}
