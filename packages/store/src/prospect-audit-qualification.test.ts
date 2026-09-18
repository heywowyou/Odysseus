import { describe, expect, it } from 'vitest';
import { NORMALIZATION_FINGERPRINT } from '@odysseus/core';
import {
  auditDataVersionState,
  classifyLegacyAuditScanIntent,
  effectiveAuditScanIntent,
  isOutreachQualifyingAudit,
} from './prospect-audit-qualification.js';

const currentProvenance = { normalizationFingerprint: NORMALIZATION_FINGERPRINT };

function audit(overrides: Record<string, unknown> = {}) {
  return {
    auditId: 'audit-1',
    scanIntent: 'prospecting-audit' as const,
    pages: [{ status: 'visited' }],
    crawl: {},
    findingsProvenance: currentProvenance,
    ...overrides,
  };
}

describe('prospect audit qualification', () => {
  it('never qualifies a complete Quick Check', () => {
    expect(isOutreachQualifyingAudit(audit({ scanIntent: 'quick-check' }))).toBe(false);
  });

  it('requires complete coverage but not the current normalization version', () => {
    expect(isOutreachQualifyingAudit(audit())).toBe(true);
    expect(isOutreachQualifyingAudit(audit({ pages: [{ status: 'error' }] }))).toBe(false);
    expect(
      isOutreachQualifyingAudit(audit({ findingsProvenance: { normalizationFingerprint: 'old' } })),
    ).toBe(true);
    expect(isOutreachQualifyingAudit(audit({ findingsProvenance: undefined }))).toBe(true);
  });

  it('reports the data version as advisory provenance state', () => {
    expect(auditDataVersionState(audit())).toBe('current');
    expect(
      auditDataVersionState(audit({ findingsProvenance: { normalizationFingerprint: 'old' } })),
    ).toBe('older');
    expect(auditDataVersionState(audit({ findingsProvenance: undefined }))).toBe('unknown');
  });

  it('allows a complete Full Audit to satisfy the same outreach requirement', () => {
    expect(isOutreachQualifyingAudit(audit({ scanIntent: 'full-audit' }))).toBe(true);
  });

  it('classifies only unambiguous legacy producing jobs', () => {
    expect(
      classifyLegacyAuditScanIntent('audit-1', [
        { type: 'outreach-full-scan', auditId: 'audit-1' },
      ]),
    ).toBe('prospecting-audit');
    expect(
      classifyLegacyAuditScanIntent('audit-1', [
        { type: 'prospecting', auditId: 'audit-1', options: { scanType: 'quick-check' } },
      ]),
    ).toBe('quick-check');
    expect(
      classifyLegacyAuditScanIntent('audit-1', [
        { type: 'prospecting', auditId: 'audit-1', options: { scanType: 'prospecting-audit' } },
      ]),
    ).toBeUndefined();
    expect(
      classifyLegacyAuditScanIntent('audit-1', [{ type: 'prospecting', auditId: 'audit-1' }]),
    ).toBeUndefined();
    expect(
      classifyLegacyAuditScanIntent('audit-1', [
        { type: 'full-audit', auditId: 'audit-1' },
        { type: 'outreach-full-scan', auditId: 'audit-1' },
      ]),
    ).toBeUndefined();
    expect(classifyLegacyAuditScanIntent('audit-1', [])).toBeUndefined();
  });

  it('uses explicit persisted intent before any legacy job relation', () => {
    expect(
      effectiveAuditScanIntent(audit({ scanIntent: 'full-audit' }), [
        { type: 'prospecting', auditId: 'audit-1' },
      ]),
    ).toBe('full-audit');
  });
});
