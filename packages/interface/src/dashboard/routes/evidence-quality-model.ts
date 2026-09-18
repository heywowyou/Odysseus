/**
 * Pure model for the audit detail page's evidence-quality card (plan 059
 * step 37): everything the card renders is computed here so it stays
 * unit-testable without a component tree, the same split as the other
 * audit-detail models.
 *
 * The stages and their order are the dashboard/progress contract of plan
 * 059 section 20. Each stage's state is derived from the persisted quality
 * assessment's blocking codes — the graph's own verdict, never embellished:
 * a stage the pipeline did not run or could not finish shows as blocked, and
 * the one capability this build deliberately lacks (empirical performance
 * calibration, plan step 41, execution handoff section 4.3.1) caps its stage
 * at "partial" with an explicit note rather than reading as complete.
 */

import type { DashboardLanguage } from '../i18n/types';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import type {
  AuditEvidenceQualityResponse,
  EvidenceQualityVerdictResponse,
} from './audit-detail-types';

/** The contract's stages, in display order (plan 059 section 20). */
export type EvidenceStageId =
  | 'scope-network-safety'
  | 'inventory-discovery'
  | 'content-acquisition'
  | 'surface-discovery'
  | 'inventory-reconciliation'
  | 'content-evidence-repair'
  | 'performance-verification'
  | 'temporal-coherence'
  | 'raw-evidence-snapshot'
  | 'normalization-verification'
  | 'evidence-approved';

export const EVIDENCE_STAGE_IDS: readonly EvidenceStageId[] = [
  'scope-network-safety',
  'inventory-discovery',
  'content-acquisition',
  'surface-discovery',
  'inventory-reconciliation',
  'content-evidence-repair',
  'performance-verification',
  'temporal-coherence',
  'raw-evidence-snapshot',
  'normalization-verification',
  'evidence-approved',
];

export type EvidenceStageState = 'complete' | 'partial' | 'blocked';

export interface EvidenceStageView {
  id: EvidenceStageId;
  label: string;
  state: EvidenceStageState;
  /** Count line under the label (pages, findings, disclosures); absent when
   *  the stage has no honest count to show. */
  count?: string;
  /** Standing note (e.g. the calibration cap); absent when complete. */
  note?: string;
}

/** Which blocking issue codes block each stage. Several stages share codes
 *  on purpose: the graph names what is unresolved, the card groups it where
 *  the contract's stages name it. */
const STAGE_BLOCKING_CODES: Record<EvidenceStageId, readonly string[]> = {
  'scope-network-safety': [
    'raw-evidence-invalid',
    'network-safety-preflight-failed',
    'environment-unapproved',
    'robots-policy-unresolved',
  ],
  'inventory-discovery': ['raw-evidence-invalid'],
  'content-acquisition': [
    'raw-evidence-invalid',
    'unresolved-material-gap',
    'unstable-material-result',
    'site-level-unknown',
    'operator-resolution-required',
  ],
  'surface-discovery': [
    'raw-evidence-invalid',
    'unresolved-material-gap',
    'unstable-material-result',
  ],
  'inventory-reconciliation': ['raw-evidence-invalid', 'inventory-unreconciled'],
  'content-evidence-repair': [
    'raw-evidence-invalid',
    'unresolved-material-gap',
    'unstable-material-result',
    'site-level-unknown',
    'operator-resolution-required',
  ],
  'performance-verification': [
    'raw-evidence-invalid',
    'unstable-material-result',
    'performance-confidence-insufficient',
  ],
  'temporal-coherence': ['temporal-drift', 'temporal-coherence-unverified'],
  'raw-evidence-snapshot': ['raw-evidence-invalid', 'consistency-gate-failed'],
  'normalization-verification': ['raw-evidence-invalid', 'consistency-gate-failed'],
  'evidence-approved': [],
};

/** The counts a stage row can show, in the page's language. */
export interface EvidenceStageCounts {
  pagesVisited: number;
  findingsCount: number;
}

function stageCount(
  id: EvidenceStageId,
  evidence: AuditEvidenceQualityResponse,
  counts: EvidenceStageCounts,
  language: DashboardLanguage,
): string | undefined {
  const table = language === 'fr' ? fr.auditDetail.evidenceQuality : en.auditDetail.evidenceQuality;
  switch (id) {
    case 'inventory-discovery':
    case 'content-acquisition':
      return table.countPagesVisited.replace('{count}', String(counts.pagesVisited));
    case 'normalization-verification':
      return table.countFindings.replace('{count}', String(counts.findingsCount));
    case 'evidence-approved':
      return evidence.approval === 'approved'
        ? table.countDisclosures.replace('{count}', String(evidence.limitationCount))
        : undefined;
    default:
      return undefined;
  }
}

/** One row per contract stage, in order. Blocked rows carry the reason the
 *  caller renders from evidenceBlockingReason below; partial rows carry the
 *  calibration note while plan 059 step 41 is pending. */
export function evidenceStageViews(
  evidence: AuditEvidenceQualityResponse,
  counts: EvidenceStageCounts,
  language: DashboardLanguage,
): EvidenceStageView[] {
  const table = language === 'fr' ? fr.auditDetail.evidenceQuality : en.auditDetail.evidenceQuality;
  const blocking = new Set(evidence.blockingCodes);
  return EVIDENCE_STAGE_IDS.map((id) => {
    const label = table.stageNames[id];
    if (id === 'evidence-approved') {
      if (evidence.approval === 'approved') {
        return {
          id,
          label,
          state: 'complete',
          count: table.countDisclosures.replace('{count}', String(evidence.limitationCount)),
        };
      }
      return {
        id,
        label,
        state: 'blocked',
        note: evidence.approval === 'stale' ? table.approvalStaleNote : table.approvalMissingNote,
      };
    }
    const blockedCode = STAGE_BLOCKING_CODES[id].find((code) => blocking.has(code));
    if (blockedCode !== undefined) {
      const count = stageCount(id, evidence, counts, language);
      const view: EvidenceStageView = {
        id,
        label,
        state: 'blocked',
        note: evidenceBlockingReason(blockedCode, language),
      };
      if (count !== undefined) view.count = count;
      return view;
    }
    // The calibration part of performance verification is not built yet:
    // measurements and their stability policy are real, the empirical
    // tolerances are not, so the stage never reads as complete.
    if (id === 'performance-verification') {
      return { id, label, state: 'partial', note: table.performanceCalibrationNote };
    }
    const count = stageCount(id, evidence, counts, language);
    const view: EvidenceStageView = { id, label, state: 'complete' };
    if (count !== undefined) view.count = count;
    return view;
  });
}

/** Badge tone per verdict: the graph's own four-value vocabulary. */
export function evidenceVerdictTone(
  verdict: EvidenceQualityVerdictResponse,
): 'minor' | 'moderate' | 'serious' | 'critical' {
  switch (verdict) {
    case 'reportable-complete':
      return 'minor';
    case 'reportable-with-known-limitations':
      return 'moderate';
    case 'needs-operator-review':
      return 'serious';
    case 'failed':
      return 'critical';
  }
}

/** One sentence per known blocking issue code, in the interface language;
 *  an unknown code falls back to the raw stable code, deliberately
 *  untranslated, the same discipline as the outreach refusal copy. */
export function evidenceBlockingReason(code: string, language: DashboardLanguage): string {
  const table = language === 'fr' ? fr.auditDetail.evidenceQuality : en.auditDetail.evidenceQuality;
  const known = table.blockingReasons[code];
  if (known !== undefined) return known;
  return table.unknownBlockingReason.replace('{code}', code);
}

export interface EvidenceBlockingReasonView {
  code: string;
  text: string;
  /** Evidence references behind the code, when the assessment recorded any. */
  refCount: number | undefined;
}

/** The blocking reasons in display order (the summary's sorted codes). */
export function evidenceBlockingReasons(
  evidence: AuditEvidenceQualityResponse,
  language: DashboardLanguage,
): EvidenceBlockingReasonView[] {
  return evidence.blockingCodes.map((code) => ({
    code,
    text: evidenceBlockingReason(code, language),
    refCount: evidence.blockingCounts[code],
  }));
}

/** The evidence fields a Plan 058 quality bundle records about the approval
 *  it was produced from (GET /report-quality's `candidate`). */
export interface QualityBundleEvidenceBinding {
  evidenceApprovalMode: string;
  approvedEvidenceDigest?: string;
}

/** Why promoting the Plan 058 bundle must stay blocked given the audit's
 *  current evidence state, or undefined when the bundle's approval still
 *  stands. Legacy-adapter bundles have their own existing refusal and note,
 *  so they are not re-described here. Pure: the ReportsCard disables its
 *  approve button from this, and the server's promotion gate enforces the
 *  same comparison authoritatively. */
export function qualityBundlePromotionBlock(
  bundle: QualityBundleEvidenceBinding,
  evidence: AuditEvidenceQualityResponse | undefined,
): 'unapproved' | 'changed' | undefined {
  if (bundle.evidenceApprovalMode === 'legacy-adapter') return undefined;
  if (evidence === undefined) return 'changed';
  if (evidence.approval === 'missing') return 'unapproved';
  if (
    evidence.approval === 'stale' ||
    evidence.approvalDigest === undefined ||
    evidence.approvalDigest !== bundle.approvedEvidenceDigest
  ) {
    return 'changed';
  }
  return undefined;
}

/** The sentence for qualityBundlePromotionBlock's reason. */
export function qualityBundlePromotionBlockCopy(
  block: 'unapproved' | 'changed',
  language: DashboardLanguage,
): string {
  const table = language === 'fr' ? fr.auditDetail.evidenceQuality : en.auditDetail.evidenceQuality;
  return block === 'unapproved' ? table.promotionBlockedUnapproved : table.promotionBlockedChanged;
}
