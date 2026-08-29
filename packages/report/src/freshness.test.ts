import { describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION, NORMALIZATION_FINGERPRINT } from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION } from './constants.js';
import { classifyReportFreshness } from './freshness.js';

const provenance = {
  findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
  normalizationFingerprint: NORMALIZATION_FINGERPRINT,
  findingsDigest: `sha256:${'0'.repeat(64)}`,
};

const report = {
  reportId: 'report-id',
  analysisId: 'analysis-id',
  findingsProvenance: provenance,
  rendererVersion: REPORT_TEMPLATE_VERSION,
  reportTemplateVersion: REPORT_TEMPLATE_VERSION,
  pdfDigest: `sha256:${'1'.repeat(64)}`,
};

describe('classifyReportFreshness', () => {
  it('marks matching, fully verified metadata fresh', () => {
    expect(classifyReportFreshness(report, provenance)).toBe('fresh');
  });

  it('marks verified but mismatched findings stale', () => {
    expect(
      classifyReportFreshness(
        {
          ...report,
          findingsProvenance: { ...provenance, findingsDigest: `sha256:${'f'.repeat(64)}` },
        },
        provenance,
      ),
    ).toBe('stale');
  });

  it('marks legacy metadata unverified', () => {
    expect(classifyReportFreshness({}, provenance)).toBe('unverified');
    expect(classifyReportFreshness(report, undefined)).toBe('unverified');
  });
});
