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
