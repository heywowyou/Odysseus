/**
 * Private evidence-ledger contracts for Plan 059.
 *
 * Confirmed findings are not authored here. This layer records what ran, what
 * was observed, what remains uncertain, and interpretation aids whose contents
 * are never allowed to inflate deterministic finding totals.
 */
import { canonicalDigest } from '@odysseus/core';

export const EVIDENCE_COVERAGE_LEDGER_VERSION = 'evidence-coverage-ledger-v1';
export const OBSERVATION_LEDGER_VERSION = 'observation-ledger-v1';
export const AUDIT_SIGNAL_VERSION = 'audit-signal-v1';
export const PAGE_SEMANTIC_PROFILE_VERSION = 'page-semantic-profile-v1';
export const PATTERN_EVIDENCE_VERSION = 'pattern-evidence-v1';

export type EvidenceCoverageOutcome =
  | 'completed'
  | 'partial'
  | 'failed'
  | 'not-applicable'
  | 'robots-disallowed'
  | 'network-safety-blocked'
  | 'operator-excluded'
  | 'site-http-state'
  | 'opaque-limitation'
  | 'unknown-legacy';

export interface EvidenceCoverageEntry {
  targetKey: string;
  checkId: string;
  surfaceId: string;
  outcome: EvidenceCoverageOutcome;
  attemptRefs: readonly string[];
  evidenceRefs: readonly string[];
  reasonCode?: string;
}

export interface EvidenceCoverageGap {
  gapId: string;
  targetKey: string;
  checkId?: string;
  surfaceId?: string;
  materiality: 'material' | 'non-material' | 'unknown';
  reasonCode: string;
  evidenceRefs: readonly string[];
}

export interface EvidenceCoverageLimitation {
  limitationId: string;
  code: string;
  targetKeys: readonly string[];
  evidenceRefs: readonly string[];
}

export interface EvidenceCoverageLedgerInput {
  evidenceEpoch: number;
  inventoryDigest: string;
  entries: readonly EvidenceCoverageEntry[];
  limitations: readonly EvidenceCoverageLimitation[];
  unresolvedGaps: readonly EvidenceCoverageGap[];
}

export interface EvidenceCoverageLedger extends EvidenceCoverageLedgerInput {
  version: typeof EVIDENCE_COVERAGE_LEDGER_VERSION;
  digest: string;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function coverageKey(entry: EvidenceCoverageEntry): string {
  return `${entry.targetKey}|${entry.checkId}|${entry.surfaceId}`;
}

export function buildEvidenceCoverageLedger(
  input: EvidenceCoverageLedgerInput,
): EvidenceCoverageLedger {
  const seen = new Set<string>();
  const entries = [...input.entries]
    .map((entry) => {
      const key = coverageKey(entry);
      if (seen.has(key)) {
        throw new Error(`buildEvidenceCoverageLedger: duplicate coverage cell ${key}`);
      }
      seen.add(key);
      return {
        ...entry,
        attemptRefs: uniqueSorted(entry.attemptRefs),
        evidenceRefs: uniqueSorted(entry.evidenceRefs),
      };
    })
    .sort((a, b) => coverageKey(a).localeCompare(coverageKey(b)));

  const limitations = [...input.limitations]
    .map((limitation) => ({
      ...limitation,
      targetKeys: uniqueSorted(limitation.targetKeys),
      evidenceRefs: uniqueSorted(limitation.evidenceRefs),
    }))
    .sort((a, b) => a.limitationId.localeCompare(b.limitationId));

  const unresolvedGaps = [...input.unresolvedGaps]
    .map((gap) => ({ ...gap, evidenceRefs: uniqueSorted(gap.evidenceRefs) }))
    .sort((a, b) => a.gapId.localeCompare(b.gapId));

  const body = {
    version: EVIDENCE_COVERAGE_LEDGER_VERSION,
    evidenceEpoch: input.evidenceEpoch,
    inventoryDigest: input.inventoryDigest,
    entries,
    limitations,
    unresolvedGaps,
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

const SECRET_PAIR =
  /\b(token|session|sessionid|auth|authorization|apikey|api_key|key|secret|password)=([^\s&]+)/giu;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/giu;

export function redactEvidenceText(value: string, maxLength = 320): string {
  const redacted = value
    .replace(SECRET_PAIR, (_match, key: string) => `${key}=[REDACTED]`)
    .replace(BEARER_VALUE, 'Bearer [REDACTED]');
  return redacted.length <= maxLength ? redacted : `${redacted.slice(0, maxLength)}…`;
}

export interface ObservationRecordInput {
  checkId: string;
  ruleId: string;
  pageIdentity: string;
  surfaceIds: readonly string[];
  acceptedAttemptRefs: readonly string[];
  selector?: string;
  elementIdentity?: string;
  resourceIdentity?: string;
  snippet?: string;
  nativeSeverity?: string;
  measurement?: number;
  observedAt: string;
  sourceArtifactDigest: string;
}

export interface ObservationRecord extends Omit<ObservationRecordInput, 'snippet'> {
  observationId: string;
  occurrenceIdentity: string;
  snippet?: string;
}

function observationCoordinates(input: ObservationRecordInput): object {
  return {
    checkId: input.checkId,
    ruleId: input.ruleId,
    pageIdentity: input.pageIdentity,
    selector: input.selector,
    elementIdentity: input.elementIdentity,
    resourceIdentity: input.resourceIdentity,
  };
}

export function buildObservationRecord(input: ObservationRecordInput): ObservationRecord {
  if (input.acceptedAttemptRefs.length === 0) {
    throw new Error('buildObservationRecord: acceptedAttemptRefs cannot be empty');
  }
  const occurrenceIdentity = canonicalDigest(observationCoordinates(input));
  const body = {
    ...input,
    surfaceIds: uniqueSorted(input.surfaceIds),
    acceptedAttemptRefs: uniqueSorted(input.acceptedAttemptRefs),
    ...(input.snippet !== undefined ? { snippet: redactEvidenceText(input.snippet) } : {}),
    occurrenceIdentity,
  };
  return {
    ...body,
    observationId: `observation:${canonicalDigest(body).slice(
      'sha256:'.length,
      'sha256:'.length + 20,
    )}`,
  };
}

export interface ObservationLedgerInput {
  evidenceEpoch: number;
  rawEvidenceSnapshotDigest: string;
  observations: readonly ObservationRecord[];
}

export interface ObservationLedger extends ObservationLedgerInput {
  version: typeof OBSERVATION_LEDGER_VERSION;
  digest: string;
}

export function buildObservationLedger(input: ObservationLedgerInput): ObservationLedger {
  const ids = new Set<string>();
  const observations = [...input.observations]
    .map((observation) => {
      if (ids.has(observation.observationId)) {
        throw new Error(
          `buildObservationLedger: duplicate observation ${observation.observationId}`,
        );
      }
      ids.add(observation.observationId);
      return observation;
    })
    .sort((a, b) => a.observationId.localeCompare(b.observationId));
  const body = {
    version: OBSERVATION_LEDGER_VERSION,
    evidenceEpoch: input.evidenceEpoch,
    rawEvidenceSnapshotDigest: input.rawEvidenceSnapshotDigest,
    observations,
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

export type AuditSignalReviewStatus = 'unreviewed' | 'confirmed' | 'rejected';

export interface AuditSignalInput {
  ruleId: string;
  evidenceRefs: readonly string[];
  confidence: 'high' | 'medium' | 'low';
  reviewStatus: AuditSignalReviewStatus;
  affectedPageIdentities: readonly string[];
  requiredConfirmationAction: string;
}

export interface AuditSignal extends AuditSignalInput {
  version: typeof AUDIT_SIGNAL_VERSION;
  signalId: string;
  digest: string;
}

export function buildAuditSignal(input: AuditSignalInput): AuditSignal {
  const body = {
    ...input,
    evidenceRefs: uniqueSorted(input.evidenceRefs),
    affectedPageIdentities: uniqueSorted(input.affectedPageIdentities),
    version: AUDIT_SIGNAL_VERSION,
  } as const;
  const digest = canonicalDigest(body);
  return {
    ...body,
    digest,
    signalId: `signal:${digest.slice('sha256:'.length, 'sha256:'.length + 20)}`,
  };
}

export type PageSemanticRole =
  'commercial' | 'transactional' | 'archive' | 'legal' | 'content' | 'unknown' | 'conflicting';

export interface PageSemanticProfileInput {
  pageIdentity: string;
  semanticRole: PageSemanticRole;
  confidence: 'high' | 'medium' | 'low';
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
  pageAuditProfileVersion: string;
  classifierVersion: string;
}

export interface PageSemanticProfile extends PageSemanticProfileInput {
  version: typeof PAGE_SEMANTIC_PROFILE_VERSION;
  digest: string;
}

export function buildPageSemanticProfile(input: PageSemanticProfileInput): PageSemanticProfile {
  const body = {
    ...input,
    reasonCodes: uniqueSorted(input.reasonCodes),
    evidenceRefs: uniqueSorted(input.evidenceRefs),
    version: PAGE_SEMANTIC_PROFILE_VERSION,
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

export interface PatternEvidenceRecordInput {
  title: string;
  ruleId: string;
  category: string;
  observationIds: readonly string[];
  affectedPageIdentities: readonly string[];
  structuralSignature: string;
  confidence: 'high' | 'medium' | 'low';
  reasonCode: string;
}

export interface PatternEvidenceRecord extends PatternEvidenceRecordInput {
  version: typeof PATTERN_EVIDENCE_VERSION;
  patternId: string;
  digest: string;
  /** Binding reminder: pattern evidence never changes finding identity/counts. */
  authoritativeForFindingIdentity: false;
  /** Plan 059 section 5.15: a pattern names a recurring observed shape, not
   *  a place in the client's source code. Ownership is claimed by nobody
   *  here; the report may only ever phrase it as a hypothesis to check. */
  provesSourceCodeOwnership: false;
}

export function buildPatternEvidenceRecord(
  input: PatternEvidenceRecordInput,
): PatternEvidenceRecord {
  if (input.observationIds.length < 2) {
    throw new Error('buildPatternEvidenceRecord: a pattern requires at least two observations');
  }
  const body = {
    ...input,
    observationIds: uniqueSorted(input.observationIds),
    affectedPageIdentities: uniqueSorted(input.affectedPageIdentities),
    version: PATTERN_EVIDENCE_VERSION as typeof PATTERN_EVIDENCE_VERSION,
    authoritativeForFindingIdentity: false as const,
    provesSourceCodeOwnership: false as const,
  };
  const digest = canonicalDigest(body);
  return {
    ...body,
    digest,
    patternId: `pattern:${digest.slice('sha256:'.length, 'sha256:'.length + 20)}`,
  };
}
