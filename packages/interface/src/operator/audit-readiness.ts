import type { ReportBundleState } from '@odysseus/core';
import type { OperatorEvidenceReadiness, OperatorReportReadiness } from './contract.js';

/**
 * Plan 060 §5.1: derives the two artifact-readiness axes from plain-data
 * facts the caller fetched from the owning authorities. The derivations are
 * pure: the caller (the route, the future control-room projection) fetches
 * durable rows and passes the narrow facts in; nothing here reads storage or
 * re-derives truth from job success.
 *
 * Unknown facts are never guessed into a pass. On the evidence axis,
 * missing/unreadable diagnostics become `unavailable`, historical
 * pre-diagnostics audits may be `legacy-unknown`, and a scoped limitation
 * remains `limited` rather than turning into operator attention. The report
 * axis below keeps its separate Plan-058 vocabulary.
 */

/** What the caller knows about the audit's scoped evidence diagnostics. */
export interface EvidenceFacts {
  diagnosticsStatus?: 'complete' | 'limited' | 'unavailable';
  limitationCodes?: string[];
  /** The caller knows a diagnostics build is genuinely in progress right now. */
  building?: boolean;
  /** The caller knows this evidence was superseded (e.g. by a re-audit). */
  superseded?: boolean;
  /** No detailed diagnostics exist because the audit predates that layer. */
  legacyAudit?: boolean;
}

export interface EvidenceReadinessView {
  readiness: OperatorEvidenceReadiness;
  limitationCodes?: string[];
  legacyAdvisory?: boolean;
}

/**
 * Plan 068 availability semantics. A limited audit is still usable and does
 * not become operator attention by default.
 */
export function deriveEvidenceReadiness(facts: EvidenceFacts): EvidenceReadinessView {
  if (facts.building === true) return { readiness: 'building' };
  if (facts.superseded === true) return { readiness: 'superseded' };
  if (facts.diagnosticsStatus === 'complete') return { readiness: 'complete' };
  if (facts.diagnosticsStatus === 'limited') {
    return {
      readiness: 'limited',
      ...(facts.limitationCodes === undefined ? {} : { limitationCodes: facts.limitationCodes }),
    };
  }
  if (facts.legacyAudit === true) {
    return { readiness: 'legacy-unknown', legacyAdvisory: true };
  }
  return { readiness: 'unavailable' };
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
