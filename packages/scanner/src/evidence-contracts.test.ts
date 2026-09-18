import { describe, expect, it } from 'vitest';
import {
  buildAccessibilityCapabilityRegistry,
  buildAuditSignal,
  buildEvidenceCoverageLedger,
  buildFrameCoverageRecord,
  buildObservationLedger,
  buildObservationRecord,
  buildPageReadinessRecord,
  buildPageSemanticProfile,
  buildPatternEvidenceRecord,
  buildScanSurface,
  capabilityTraversalLevel,
  redactEvidenceText,
} from './index.js';

describe('Plan 059 evidence contracts', () => {
  it('keeps the evidence builders reachable from the scanner package', () => {
    const builders = [
      buildAccessibilityCapabilityRegistry,
      buildAuditSignal,
      buildEvidenceCoverageLedger,
      buildFrameCoverageRecord,
      buildObservationLedger,
      buildObservationRecord,
      buildPageReadinessRecord,
      buildPageSemanticProfile,
      buildPatternEvidenceRecord,
      buildScanSurface,
      capabilityTraversalLevel,
      redactEvidenceText,
    ];
    expect(builders.every((builder) => typeof builder === 'function')).toBe(true);
  });
});

describe('occurrence identity across surfaces (plan 059 step 10)', () => {
  it('gives the same underlying defect the same occurrence identity on desktop and mobile', () => {
    const base = {
      checkId: 'axe',
      ruleId: 'target-size',
      pageIdentity: 'https://example.com/chambres',
      selector: 'a.phone-cta',
      acceptedAttemptRefs: ['attempt-1'],
      observedAt: '2026-09-18T09:00:00.000Z',
      sourceArtifactDigest: 'sha256:artifact',
    };
    const desktop = buildObservationRecord({ ...base, surfaceIds: ['surface:desktop'] });
    const mobile = buildObservationRecord({ ...base, surfaceIds: ['surface:mobile'] });

    // Surfaces are confirming dimensions: they are recorded on the
    // observation, but they never multiply the occurrence.
    expect(desktop.occurrenceIdentity).toBe(mobile.occurrenceIdentity);
    expect(desktop.surfaceIds).toEqual(['surface:desktop']);
    expect(mobile.surfaceIds).toEqual(['surface:mobile']);
  });
});
