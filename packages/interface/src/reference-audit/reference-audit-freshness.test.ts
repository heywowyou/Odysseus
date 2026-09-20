import { describe, expect, it } from 'vitest';
import { NORMALIZATION_FINGERPRINT } from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION } from '@odysseus/report';
import { REFERENCE_AUDIT_ANONYMIZER_VERSION } from '@odysseus/report';
import { classifyReferenceAuditFreshness } from './reference-audit-freshness.js';
import type { ReferenceAuditCurrentManifest } from './reference-audit-publication.js';

const manifest: ReferenceAuditCurrentManifest = {
  schemaVersion: 'reference-audit-v1',
  objectKey: `reference-audit/${'a'.repeat(64)}.pdf`,
  pdfSha256: 'a'.repeat(64),
  publishedAt: '2026-09-20T10:00:00.000Z',
  rendererBuild: 'test',
  reportTemplateVersion: REPORT_TEMPLATE_VERSION,
  dataVersion: NORMALIZATION_FINGERPRINT,
  anonymizerVersion: REFERENCE_AUDIT_ANONYMIZER_VERSION,
  referenceReleaseVersion: 'reference-release-v1',
  pageCount: 14,
  releaseStatus: 'approved',
};

describe('reference audit freshness', () => {
  it('marks the approved pointer current when all governing versions match', () => {
    expect(classifyReferenceAuditFreshness(manifest)).toEqual({ state: 'current', manifest });
  });

  it.each([
    ['reportTemplateVersion', 'template-changed'],
    ['dataVersion', 'data-changed'],
    ['anonymizerVersion', 'anonymizer-changed'],
  ] as const)('marks %s drift stale', (field, reason) => {
    const stale = {
      ...manifest,
      [field]: field === 'reportTemplateVersion' ? REPORT_TEMPLATE_VERSION + 1 : 'older',
    } as ReferenceAuditCurrentManifest;
    expect(classifyReferenceAuditFreshness(stale)).toEqual({
      state: 'stale',
      manifest: stale,
      reason,
    });
  });

  it('distinguishes an absent pointer from a stale release', () => {
    expect(classifyReferenceAuditFreshness(null)).toEqual({
      state: 'missing',
      reason: 'not-published',
    });
  });
});
