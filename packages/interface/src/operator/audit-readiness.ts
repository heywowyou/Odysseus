import type { ReportBundleState } from '@odysseus/core';
import type { OperatorEvidenceReadiness, OperatorReportReadiness } from './contract.js';

/**
 * Plan 060 §5.1: derives the two artifact-readiness axes from plain-data
 * facts the caller fetched from the owning authorities. The derivations are
 * pure: the caller (the route, the future control-room projection) fetches
 * durable rows and passes the narrow facts in; nothing here reads storage or
 * re-derives truth from job success.
 *
 * Fail closed (plan 060 §17): an input this module does not recognize is
 * ignored, never guessed into a pass. Unknown run states, absent facts and
 * pre-quality-pipeline history all land on `absent`; an audit whose stored
 * facts predate the evidence graph lands on `legacy-unknown` with an
 * advisory, never a fabricated verdict (plan 060 §9.2). Assessment failures
 * are NOT operator attention today (the Plan-059 dashboard phases are not
 * started), so assessed-but-unapproved evidence reads as `absent`, not
 * `needs-attention`.
 */

/** What the caller knows about the audit's Plan-059 evidence. Every field
 *  is optional: absent means "no such fact was fetched", and the derivation
 *  treats that as the fail-closed absence it is. */
export interface EvidenceFacts {
  /** The audit's evidence graph was assessed (a quality assessment exists). */
  graphAssessed?: boolean;
  /** An ApprovedAuditEvidence exists for the current graph. */
  approved?: boolean;
  /** The approval's verdict is reportable-with-known-limitations. */
  approvedWithLimitations?: boolean;
  /** Closed limitation codes carried by that approval. */
  limitationCodes?: string[];
  /** Digest reference of the approved evidence root. */
  digestRef?: string;
  /** The caller knows a graph build is genuinely in progress right now. */
  building?: boolean;
  /** The caller knows this evidence was superseded (e.g. by a re-audit). */
  superseded?: boolean;
  /** No graph exists and the audit predates the evidence graph. */
  legacyAudit?: boolean;
}

export interface EvidenceReadinessView {
  readiness: OperatorEvidenceReadiness;
  digestRef?: string;
  limitationCodes?: string[];
  legacyAdvisory?: boolean;
}

/**
 * Binding mapping (plan 060 §5.1), evaluated in this order:
 *   approved + with-limitations  -> approved-with-limitations
 *   approved                     -> approved-complete
 *   assessed but not approved    -> absent (fail-closed, see module comment)
 *   building                     -> building
 *   superseded                   -> superseded
 *   legacy audit, no graph       -> legacy-unknown (+legacyAdvisory)
 *   anything else                -> absent
 */
export function deriveEvidenceReadiness(facts: EvidenceFacts): EvidenceReadinessView {
  if (facts.approved === true) {
    if (facts.approvedWithLimitations === true) {
      return {
        readiness: 'approved-with-limitations',
        ...(facts.digestRef === undefined ? {} : { digestRef: facts.digestRef }),
        ...(facts.limitationCodes === undefined ? {} : { limitationCodes: facts.limitationCodes }),
      };
    }
    return {
      readiness: 'approved-complete',
      ...(facts.digestRef === undefined ? {} : { digestRef: facts.digestRef }),
    };
  }
  if (facts.graphAssessed === true) return { readiness: 'absent' };
  if (facts.building === true) return { readiness: 'building' };
  if (facts.superseded === true) return { readiness: 'superseded' };
  if (facts.legacyAudit === true) return { readiness: 'legacy-unknown', legacyAdvisory: true };
  return { readiness: 'absent' };
}

/** What the caller knows about the audit's Plan-058 report quality. */
export interface ReportQualityFacts {
  /** The latest durable quality-run state, spelled exactly as the store
   *  schema does. An unrecognized value is ignored, never guessed. */
  runState?: string;
  /** The latest quality run's durable reference. */
  runRef?: string;
  /** The latest quality-approved bundle's digest. A bundle row exists only
   *  once the quality gate has recorded it, so a defined digest means a
   *  quality-approved bundle is on file. */
  candidateDigest?: string;
  /** The active bundle's digest, when promotion has happened. */
  activeDigest?: string;
  /** The latest bundle came from an earlier run than the latest run. */
  candidateSuperseded?: boolean;
  /** The current bundle itself carries the operator approval (the store
   *  stamps operator-approved/promoted only on the exact approved digest). */
  operatorApprovalMatchesCurrentBundle?: boolean;
  /** The in-memory production registry says a report is being produced for
   *  this audit right now. */
  producing?: boolean;
}

export interface ReportReadinessView {
  readiness: OperatorReportReadiness;
  qualityRunRef?: string;
  candidateDigest?: string;
  activeDigest?: string;
}

/**
 * The Plan-058 run states (plan 058 §15 machine, store's
 * REPORT_QUALITY_RUN_TRANSITIONS). `Record<ReportBundleState, ...>` keeps
 * this exhaustive: a state added to the core type fails to compile here
 * instead of silently inheriting a readiness. The production phases run
 * content -> parity -> per-language candidates -> final review; the
 * post-quality states are decided by the recorded bundle below, not by the
 * run row, and there is no iteration-ceiling state in the schema.
 */
const RUN_STATE_CLASS: Record<
  ReportBundleState,
  'producing' | 'needs-attention' | 'failed' | 'post-quality'
> = {
  running: 'producing',
  'content-clean': 'producing',
  'parity-clean': 'producing',
  'fr-candidate-clean': 'producing',
  'en-candidate-clean': 'producing',
  'bundle-final-review': 'producing',
  'needs-operator-review': 'needs-attention',
  failed: 'failed',
  'quality-approved': 'post-quality',
  'awaiting-operator-approval': 'post-quality',
  'operator-approved': 'post-quality',
  promoted: 'post-quality',
};

/**
 * Binding mapping (plan 060 §5.1), evaluated in this order:
 *   live production (in-memory flag or a producing run state) -> producing
 *   run needs-operator-review                                  -> needs-attention
 *   run failed                                                 -> failed
 *   quality-approved bundle recorded + activated               -> active
 *   quality-approved + operator approval on the exact bundle   -> operator-approved
 *   quality-approved, no operator approval yet                 -> quality-approved
 *   superseded candidate                                       -> superseded
 *   nothing                                                    -> absent
 *
 * A rendered legacy pair is not Plan-058 truth and never enters this
 * derivation: with no quality facts the axis reads `absent` (plan 060 §5.1).
 * `awaiting-operator-approval` stays reserved for an explicit delivery
 * review flag that does not exist in the data model yet, so a recorded
 * bundle without operator approval is `quality-approved`, never
 * `awaiting-operator-approval`.
 */
export function deriveReportReadiness(facts: ReportQualityFacts): ReportReadinessView {
  const runClass =
    facts.runState === undefined ? undefined : RUN_STATE_CLASS[facts.runState as ReportBundleState];
  if (facts.producing === true || runClass === 'producing') {
    return { readiness: 'producing', ...runRefOf(facts) };
  }
  if (runClass === 'needs-attention') {
    return { readiness: 'needs-attention', ...runRefOf(facts) };
  }
  if (runClass === 'failed') {
    return { readiness: 'failed', ...runRefOf(facts) };
  }
  if (facts.candidateDigest !== undefined) {
    if (facts.activeDigest !== undefined) {
      return {
        readiness: 'active',
        activeDigest: facts.activeDigest,
        ...(facts.candidateDigest === facts.activeDigest
          ? { candidateDigest: facts.candidateDigest }
          : {}),
        ...runRefOf(facts),
      };
    }
    if (facts.operatorApprovalMatchesCurrentBundle === true) {
      return {
        readiness: 'operator-approved',
        candidateDigest: facts.candidateDigest,
        ...runRefOf(facts),
      };
    }
    return {
      readiness: 'quality-approved',
      candidateDigest: facts.candidateDigest,
      ...runRefOf(facts),
    };
  }
  if (facts.candidateSuperseded === true) {
    return { readiness: 'superseded', ...runRefOf(facts) };
  }
  return { readiness: 'absent' };
}

function runRefOf(facts: ReportQualityFacts): { qualityRunRef?: string } {
  return facts.runRef === undefined ? {} : { qualityRunRef: facts.runRef };
}
