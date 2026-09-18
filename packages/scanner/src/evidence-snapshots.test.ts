import { describe, expect, it } from 'vitest';
import {
  buildAuditEvidenceSnapshot,
  buildEvidenceQualityAssessment,
  buildRawEvidenceSnapshot,
  produceApprovedAuditEvidence,
  runEvidenceConsistencyGate,
} from './evidence-snapshots.js';
import { buildObservationLedger } from './evidence-ledger.js';

const D = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

describe('evidence snapshot contracts', () => {
  it('binds one coherent evidence epoch into a system approval', () => {
    const raw = buildRawEvidenceSnapshot({
      auditId: 'audit-1',
      evidenceEpoch: 1,
      scopeDigest: D,
      networkPolicyDigest: D,
      robotsPolicyDigest: D,
      inventoryDigest: D,
      attemptLedgerDigest: D,
      acceptedArtifactDigests: [D],
      evidenceCoverageLedgerDigest: D,
      readinessRecordDigests: [],
      frameCoverageRecordDigests: [],
      environmentFingerprintDigest: D,
      configFingerprintDigest: D,
      temporalCoherence: {
        status: 'coherent',
        startedAt: '2026-09-18T00:00:00.000Z',
        finishedAt: '2026-09-18T00:10:00.000Z',
      },
    });
    const observations = buildObservationLedger({
      evidenceEpoch: 1,
      rawEvidenceSnapshotDigest: raw.digest,
      observations: [],
    });
    const audit = buildAuditEvidenceSnapshot({
      auditId: 'audit-1',
      evidenceEpoch: 1,
      rawEvidenceSnapshotDigest: raw.digest,
      observationLedgerDigest: observations.digest,
      confirmedFindingsDigest: D,
      signalsDigest: D,
      pageSemanticProfilesDigest: D,
      patternEvidenceDigest: D,
      capabilityRegistryVersion: 'cap-v1',
      capabilityRegistryDigest: D,
      evidenceCoverageSignature: {
        digest: D,
        scopeSignature: D,
        checkRegistryVersion: 'checks-v1',
        surfaceRegistryVersion: 'surfaces-v1',
        capabilityRegistryVersion: 'cap-v1',
        normalizationContract: 'normalization-v1',
      },
    });
    const quality = buildEvidenceQualityAssessment({
      auditId: 'audit-1',
      evidenceEpoch: 1,
      auditEvidenceSnapshotDigest: audit.digest,
      issues: [],
    });

    expect(runEvidenceConsistencyGate({ raw, observations, audit, quality }).passed).toBe(true);
    expect(
      produceApprovedAuditEvidence({
        raw,
        audit,
        assessment: quality,
        approvalMode: 'system',
        approvedAt: '2026-09-18T00:11:00.000Z',
        approvedBySystemVersion: 'test',
      }).approvalMode,
    ).toBe('system');
  });

  it('refuses to approve an unresolved operator gate', () => {
    const quality = buildEvidenceQualityAssessment({
      auditId: 'audit-1',
      evidenceEpoch: 1,
      auditEvidenceSnapshotDigest: D,
      issues: [
        {
          code: 'operator-resolution-required',
          severity: 'blocking',
          resolution: 'operator',
          summary: 'conflicting material attempts',
          evidenceRefs: ['attempt:a', 'attempt:b'],
        },
      ],
    });
    expect(quality.verdict).toBe('needs-operator-review');
  });
});
