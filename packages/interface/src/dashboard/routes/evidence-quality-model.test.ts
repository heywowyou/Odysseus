import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import {
  EVIDENCE_STAGE_IDS,
  evidenceBlockingReason,
  evidenceBlockingReasons,
  evidenceStageViews,
  evidenceVerdictTone,
  qualityBundlePromotionBlock,
  qualityBundlePromotionBlockCopy,
  type EvidenceStageView,
} from './evidence-quality-model';
import type { AuditEvidenceQualityResponse } from './audit-detail-types';

/** The summary GET /api/audits/:auditId sends for a real full audit today:
 *  assessed `failed` with the two by-construction blockers (execution
 *  handoff section 0.2), one limitation disclosure. */
function summary(
  overrides: Partial<AuditEvidenceQualityResponse> = {},
): AuditEvidenceQualityResponse {
  return {
    verdict: 'failed',
    approval: 'missing',
    blockingCodes: ['environment-unapproved', 'temporal-coherence-unverified'],
    blockingCounts: { 'environment-unapproved': 1, 'temporal-coherence-unverified': 3 },
    limitationCount: 1,
    ...overrides,
  };
}

const COUNTS = { pagesVisited: 42, findingsCount: 17 };

function stageById(views: EvidenceStageView[], id: string): EvidenceStageView {
  const view = views.find((entry) => entry.id === id);
  if (view === undefined) throw new Error(`missing stage ${id}`);
  return view;
}

describe('evidenceStageViews', () => {
  it('renders the contract stages in order (plan 059 section 20)', () => {
    const views = evidenceStageViews(summary(), COUNTS, 'fr');
    expect(views.map((view) => view.id)).toEqual([...EVIDENCE_STAGE_IDS]);
    expect(EVIDENCE_STAGE_IDS).toEqual([
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
    ]);
  });

  it('maps the real verdict onto the stages: safety blocked by the isolation verdict, temporal blocked', () => {
    const views = evidenceStageViews(summary(), COUNTS, 'en');
    const safety = stageById(views, 'scope-network-safety');
    expect(safety.state).toBe('blocked');
    expect(safety.note).toBe(
      en.auditDetail.evidenceQuality.blockingReasons['environment-unapproved'],
    );
    expect(stageById(views, 'temporal-coherence').state).toBe('blocked');
    expect(stageById(views, 'temporal-coherence').note).toBe(
      en.auditDetail.evidenceQuality.blockingReasons['temporal-coherence-unverified'],
    );
    // Stages the graph raises no blocker for read as completed, never as
    // merely pending: the graph records that they ran and reconciled.
    expect(stageById(views, 'inventory-reconciliation').state).toBe('complete');
    expect(stageById(views, 'normalization-verification').state).toBe('complete');
  });

  it('caps performance verification at partial with the calibration note even when clear', () => {
    const views = evidenceStageViews(
      summary({ blockingCodes: [], blockingCounts: {} }),
      COUNTS,
      'fr',
    );
    const performance = stageById(views, 'performance-verification');
    expect(performance.state).toBe('partial');
    expect(performance.note).toBe(fr.auditDetail.evidenceQuality.performanceCalibrationNote);
  });

  it('blocks the approval stage with the assessment-not-approved note', () => {
    const views = evidenceStageViews(summary(), COUNTS, 'fr');
    const approvalStage = stageById(views, 'evidence-approved');
    expect(approvalStage.state).toBe('blocked');
    expect(approvalStage.note).toBe(fr.auditDetail.evidenceQuality.approvalMissingNote);
    expect(approvalStage.count).toBeUndefined();
  });

  it('blocks the approval stage with the stale note when the approval no longer matches', () => {
    const views = evidenceStageViews(summary({ approval: 'stale' }), COUNTS, 'en');
    const approvalStage = stageById(views, 'evidence-approved');
    expect(approvalStage.state).toBe('blocked');
    expect(approvalStage.note).toBe(en.auditDetail.evidenceQuality.approvalStaleNote);
  });

  it('completes the approval stage with the disclosure count when approved', () => {
    const views = evidenceStageViews(
      summary({
        verdict: 'reportable-with-known-limitations',
        approval: 'approved',
        approvalDigest: 'sha256:' + 'a'.repeat(64),
        blockingCodes: [],
        blockingCounts: {},
        limitationCount: 2,
      }),
      COUNTS,
      'fr',
    );
    const approvalStage = stageById(views, 'evidence-approved');
    expect(approvalStage.state).toBe('complete');
    expect(approvalStage.count).toBe(
      fr.auditDetail.evidenceQuality.countDisclosures.replace('{count}', '2'),
    );
  });

  it('shows counts per stage from what the response really carries', () => {
    const views = evidenceStageViews(summary(), COUNTS, 'fr');
    expect(stageById(views, 'inventory-discovery').count).toBe('42 pages visitées');
    expect(stageById(views, 'content-acquisition').count).toBe('42 pages visitées');
    expect(stageById(views, 'normalization-verification').count).toBe('17 constats enregistrés');
    expect(stageById(views, 'scope-network-safety').count).toBeUndefined();
    expect(
      stageById(evidenceStageViews(summary(), COUNTS, 'en'), 'inventory-discovery').count,
    ).toBe('42 pages visited');
  });
});

describe('evidence blocking reason copy', () => {
  it('maps every known code to one sentence per language', () => {
    expect(evidenceBlockingReason('environment-unapproved', 'fr')).toBe(
      fr.auditDetail.evidenceQuality.blockingReasons['environment-unapproved'],
    );
    expect(evidenceBlockingReason('environment-unapproved', 'en')).toBe(
      en.auditDetail.evidenceQuality.blockingReasons['environment-unapproved'],
    );
    expect(evidenceBlockingReason('environment-unapproved', 'fr')).not.toBe(
      evidenceBlockingReason('environment-unapproved', 'en'),
    );
  });

  it('falls back to the raw stable code for an unknown code, untranslated', () => {
    expect(evidenceBlockingReason('a-future-code', 'fr')).toBe(
      'Raison de blocage inconnue (a-future-code).',
    );
    expect(evidenceBlockingReason('a-future-code', 'en')).toBe(
      'Unknown blocking reason (a-future-code).',
    );
  });

  it('lists the blocking reasons with their reference counts', () => {
    const reasons = evidenceBlockingReasons(summary(), 'en');
    expect(reasons.map((reason) => reason.code)).toEqual([
      'environment-unapproved',
      'temporal-coherence-unverified',
    ]);
    expect(reasons[0]?.refCount).toBe(1);
    expect(reasons[1]?.refCount).toBe(3);
    expect(reasons[0]?.text).toBe(
      en.auditDetail.evidenceQuality.blockingReasons['environment-unapproved'],
    );
  });

  it('renders verdict tones from serious (review) to critical (failed)', () => {
    expect(evidenceVerdictTone('reportable-complete')).toBe('minor');
    expect(evidenceVerdictTone('reportable-with-known-limitations')).toBe('moderate');
    expect(evidenceVerdictTone('needs-operator-review')).toBe('serious');
    expect(evidenceVerdictTone('failed')).toBe('critical');
  });
});

describe('qualityBundlePromotionBlock (plan 059 section 20 conflict guard)', () => {
  const approvedEvidence = summary({
    verdict: 'reportable-complete',
    approval: 'approved',
    approvalDigest: 'sha256:approved',
    blockingCodes: [],
    blockingCounts: {},
  });

  it('stays silent for legacy-adapter bundles, which have their own refusal', () => {
    expect(
      qualityBundlePromotionBlock({ evidenceApprovalMode: 'legacy-adapter' }, summary()),
    ).toBeUndefined();
    expect(
      qualityBundlePromotionBlock({ evidenceApprovalMode: 'legacy-adapter' }, undefined),
    ).toBeUndefined();
  });

  it('allows a bundle whose pinned approval still stands next to its roots', () => {
    expect(
      qualityBundlePromotionBlock(
        { evidenceApprovalMode: 'system', approvedEvidenceDigest: 'sha256:approved' },
        approvedEvidence,
      ),
    ).toBeUndefined();
  });

  it('blocks with unapproved when the graph was assessed without an approval', () => {
    expect(
      qualityBundlePromotionBlock(
        { evidenceApprovalMode: 'system', approvedEvidenceDigest: 'sha256:x' },
        summary({ approval: 'missing' }),
      ),
    ).toBe('unapproved');
  });

  it('blocks with changed when the approval no longer matches its roots', () => {
    expect(
      qualityBundlePromotionBlock(
        { evidenceApprovalMode: 'system', approvedEvidenceDigest: 'sha256:approved' },
        summary({
          approval: 'stale',
          approvalDigest: undefined,
        }),
      ),
    ).toBe('changed');
  });

  it('blocks with changed when the bundle pins another approval than the standing one', () => {
    expect(
      qualityBundlePromotionBlock(
        { evidenceApprovalMode: 'system', approvedEvidenceDigest: 'sha256:older-run' },
        approvedEvidence,
      ),
    ).toBe('changed');
  });

  it('blocks with changed when the audit has no evidence summary at all', () => {
    expect(
      qualityBundlePromotionBlock(
        { evidenceApprovalMode: 'system', approvedEvidenceDigest: 'sha256:approved' },
        undefined,
      ),
    ).toBe('changed');
  });

  it('always turns a block into a sentence per language', () => {
    expect(qualityBundlePromotionBlockCopy('unapproved', 'fr')).toBe(
      fr.auditDetail.evidenceQuality.promotionBlockedUnapproved,
    );
    expect(qualityBundlePromotionBlockCopy('unapproved', 'en')).toBe(
      en.auditDetail.evidenceQuality.promotionBlockedUnapproved,
    );
    expect(qualityBundlePromotionBlockCopy('changed', 'fr')).toBe(
      fr.auditDetail.evidenceQuality.promotionBlockedChanged,
    );
    expect(qualityBundlePromotionBlockCopy('changed', 'en')).toBe(
      en.auditDetail.evidenceQuality.promotionBlockedChanged,
    );
  });
});
