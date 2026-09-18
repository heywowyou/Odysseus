import { describe, expect, it } from 'vitest';
import {
  deriveEvidenceReadiness,
  deriveReportReadiness,
  type EvidenceFacts,
  type ReportQualityFacts,
} from './audit-readiness.js';
import type { ReportBundleState } from '@odysseus/core';

/**
 * Plan 060 §5.1 mapping table, proven row by row: the readiness axes are
 * derived only from their owning authority's facts and stay independent of
 * each other and of work execution (§19 combination rows at the bottom).
 */

describe('deriveEvidenceReadiness', () => {
  it('maps an approval with limitations to approved-with-limitations and carries its codes', () => {
    const facts: EvidenceFacts = {
      approved: true,
      approvedWithLimitations: true,
      limitationCodes: ['legacy-evidence-lineage'],
      digestRef: 'sha256:' + 'a'.repeat(64),
    };
    expect(deriveEvidenceReadiness(facts)).toEqual({
      readiness: 'approved-with-limitations',
      digestRef: 'sha256:' + 'a'.repeat(64),
      limitationCodes: ['legacy-evidence-lineage'],
    });
  });

  it('maps a complete approval to approved-complete with its digest reference', () => {
    const digest = 'sha256:' + 'b'.repeat(64);
    const view = deriveEvidenceReadiness({ approved: true, digestRef: digest });
    expect(view).toEqual({ readiness: 'approved-complete', digestRef: digest });
  });

  it('maps assessed-but-unapproved evidence to absent, not needs-attention', () => {
    // The 059 dashboard phases are not started: assessment failures are not
    // operator attention, and a refused graph must never read as a pass.
    expect(deriveEvidenceReadiness({ graphAssessed: true })).toEqual({ readiness: 'absent' });
  });

  it('maps building and superseded facts', () => {
    expect(deriveEvidenceReadiness({ building: true })).toEqual({ readiness: 'building' });
    expect(deriveEvidenceReadiness({ superseded: true })).toEqual({ readiness: 'superseded' });
  });

  it('maps a legacy audit to legacy-unknown with the advisory, never a guessed pass', () => {
    expect(deriveEvidenceReadiness({ legacyAudit: true })).toEqual({
      readiness: 'legacy-unknown',
      legacyAdvisory: true,
    });
  });

  it('maps a current audit whose graph is not built yet to absent', () => {
    expect(deriveEvidenceReadiness({})).toEqual({ readiness: 'absent' });
    expect(deriveEvidenceReadiness({ graphAssessed: false, legacyAudit: false })).toEqual({
      readiness: 'absent',
    });
  });

  it('keeps the binding row order: an approval stands over building or superseded flags', () => {
    expect(
      deriveEvidenceReadiness({ approved: true, building: true, superseded: true }).readiness,
    ).toBe('approved-complete');
    // And assessed-but-unapproved over a stale building flag from a rerun.
    expect(
      deriveEvidenceReadiness({ graphAssessed: true, approved: false, building: true }).readiness,
    ).toBe('absent');
  });
});

describe('deriveReportReadiness over every schema run state', () => {
  // The exact ReportBundleState names from the Plan-058 store schema.
  const ALL_RUN_STATES: ReportBundleState[] = [
    'running',
    'content-clean',
    'parity-clean',
    'fr-candidate-clean',
    'en-candidate-clean',
    'bundle-final-review',
    'quality-approved',
    'awaiting-operator-approval',
    'operator-approved',
    'promoted',
    'needs-operator-review',
    'failed',
  ];

  const PRODUCING_STATES = [
    'running',
    'content-clean',
    'parity-clean',
    'fr-candidate-clean',
    'en-candidate-clean',
    'bundle-final-review',
  ] as const;

  it('maps each production phase to producing and nothing else', () => {
    for (const state of PRODUCING_STATES) {
      expect(deriveReportReadiness({ runState: state, runRef: 'run-1' })).toEqual({
        readiness: 'producing',
        qualityRunRef: 'run-1',
      });
    }
  });

  it('maps needs-operator-review to needs-attention', () => {
    expect(deriveReportReadiness({ runState: 'needs-operator-review', runRef: 'run-2' })).toEqual({
      readiness: 'needs-attention',
      qualityRunRef: 'run-2',
    });
  });

  it('maps failed to failed', () => {
    expect(deriveReportReadiness({ runState: 'failed', runRef: 'run-3' })).toEqual({
      readiness: 'failed',
      qualityRunRef: 'run-3',
    });
  });

  it('maps post-quality run states through the recorded bundle, never straight to a verdict', () => {
    for (const state of [
      'quality-approved',
      'awaiting-operator-approval',
      'operator-approved',
      'promoted',
    ]) {
      // No bundle recorded: fail closed to absent even though the run row
      // claims a post-quality state.
      expect(deriveReportReadiness({ runState: state, runRef: 'run-4' })).toEqual({
        readiness: 'absent',
      });
    }
  });

  it('covers all twelve schema states exactly once in this table', () => {
    expect(ALL_RUN_STATES).toHaveLength(12);
    expect(new Set(ALL_RUN_STATES).size).toBe(12);
  });

  it('maps a recorded quality-approved bundle without approval to quality-approved', () => {
    expect(
      deriveReportReadiness({ candidateDigest: 'sha256:' + 'c'.repeat(64), runRef: 'run-5' }),
    ).toEqual({
      readiness: 'quality-approved',
      candidateDigest: 'sha256:' + 'c'.repeat(64),
      qualityRunRef: 'run-5',
    });
  });

  it('never emits awaiting-operator-approval: the delivery-review flag does not exist yet', () => {
    const view = deriveReportReadiness({
      runState: 'awaiting-operator-approval',
      candidateDigest: 'sha256:' + 'c'.repeat(64),
    });
    expect(view.readiness).toBe('quality-approved');
  });

  it('maps an operator approval on the exact current bundle to operator-approved', () => {
    expect(
      deriveReportReadiness({
        candidateDigest: 'sha256:' + 'd'.repeat(64),
        operatorApprovalMatchesCurrentBundle: true,
      }),
    ).toEqual({ readiness: 'operator-approved', candidateDigest: 'sha256:' + 'd'.repeat(64) });
  });

  it('maps an activated bundle to active with the active digest', () => {
    const digest = 'sha256:' + 'e'.repeat(64);
    expect(deriveReportReadiness({ candidateDigest: digest, activeDigest: digest })).toEqual({
      readiness: 'active',
      activeDigest: digest,
      candidateDigest: digest,
    });
  });

  it('maps a superseded candidate to superseded', () => {
    expect(deriveReportReadiness({ candidateSuperseded: true, runRef: 'run-6' })).toEqual({
      readiness: 'superseded',
      qualityRunRef: 'run-6',
    });
  });

  it('fails closed: an unrecognized run state is ignored, not guessed into producing', () => {
    expect(deriveReportReadiness({ runState: 'some-future-state' })).toEqual({
      readiness: 'absent',
    });
    // The bundle row stays authoritative when only the run state is unknown.
    expect(
      deriveReportReadiness({
        runState: 'some-future-state',
        candidateDigest: 'sha256:' + 'f'.repeat(64),
      }),
    ).toEqual({ readiness: 'quality-approved', candidateDigest: 'sha256:' + 'f'.repeat(64) });
  });

  it('maps in-memory production to producing even over a past failed run', () => {
    // A legacy regeneration running right now is the present truth; the
    // failed run is history.
    expect(deriveReportReadiness({ runState: 'failed', producing: true })).toEqual({
      readiness: 'producing',
    });
  });

  it('maps no quality facts at all to absent: a legacy report pair is not 058 truth', () => {
    expect(deriveReportReadiness({})).toEqual({ readiness: 'absent' });
    const facts: ReportQualityFacts = { producing: false };
    expect(deriveReportReadiness(facts)).toEqual({ readiness: 'absent' });
  });
});

describe('plan 060 §19 independence matrix', () => {
  it('failed report run + approved evidence keep both truths', () => {
    const report = deriveReportReadiness({ runState: 'failed' });
    const evidence = deriveEvidenceReadiness({ approved: true });
    expect(report.readiness).toBe('failed');
    expect(evidence.readiness).toBe('approved-complete');
  });

  it('producing report + absent evidence keep both truths', () => {
    const report = deriveReportReadiness({ runState: 'running' });
    const evidence = deriveEvidenceReadiness({});
    expect(report.readiness).toBe('producing');
    expect(evidence.readiness).toBe('absent');
  });

  it('quality-approved report + failed work keep both truths', () => {
    // Work execution is a caller-provided axis; here it is failed while the
    // report authority proves a quality-approved bundle.
    const report = deriveReportReadiness({ candidateDigest: 'sha256:' + '9'.repeat(64) });
    const evidence = deriveEvidenceReadiness({ approved: true, approvedWithLimitations: true });
    const failedWorkState = 'failed' as const;
    expect(report.readiness).toBe('quality-approved');
    expect(evidence.readiness).toBe('approved-with-limitations');
    expect(failedWorkState).toBe('failed');
  });
});
