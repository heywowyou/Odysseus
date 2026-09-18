import { describe, expect, it } from 'vitest';
import type { Sha256Digest } from '@odysseus/core';
import { reportQualityDigest } from '@odysseus/report';
import { summarizeAuditEvidenceQuality } from './audit-evidence-quality.js';

/**
 * Plan 059 step 37: the dashboard evidence summary is pure over the three
 * parsed evidence roots, so these tests need no filesystem and no graph
 * assembly. The approval comparisons mirror the Plan 058 loader's own
 * refusals (report-quality-evidence.test.ts), which is the point: the
 * dashboard must show the same approval state the 058 path enforces.
 */

const AUDIT_ID = 'audit-dashboard-test';
const AUDIT_DIGEST = `sha256:${'a'.repeat(64)}` as Sha256Digest;
const QUALITY_DIGEST = `sha256:${'b'.repeat(64)}` as Sha256Digest;

function quality(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    auditId: AUDIT_ID,
    digest: QUALITY_DIGEST,
    verdict: 'failed',
    issues: [
      {
        code: 'environment-unapproved',
        severity: 'blocking',
        resolution: 'system',
        summary: 'The browser ran without an approved isolation profile.',
        evidenceRefs: ['sandbox-missing'],
      },
      {
        code: 'temporal-coherence-unverified',
        severity: 'blocking',
        resolution: 'system',
        summary: 'The audit cannot show one site version.',
        evidenceRefs: ['anchors-uncaptured', 'anchors-uncaptured-2'],
      },
      {
        code: 'capability-gap-undisclosed',
        severity: 'limitation',
        resolution: 'operator',
        summary: 'Material third-party content could not be inspected.',
        evidenceRefs: ['frame-ref'],
        disclosure: { limitationId: 'limitation:third-party-frame-opaque' },
      },
    ],
    mandatoryDisclosures: [{ limitationId: 'limitation:third-party-frame-opaque' }],
    ...overrides,
  };
}

function auditRoot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    auditId: AUDIT_ID,
    digest: AUDIT_DIGEST,
    confirmedFindingsDigest: `sha256:${'c'.repeat(64)}`,
    ...overrides,
  };
}

function approval(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    auditId: AUDIT_ID,
    auditEvidenceSnapshotDigest: AUDIT_DIGEST,
    evidenceQualityAssessmentDigest: QUALITY_DIGEST,
    verdict: 'reportable-complete',
    approvalMode: 'system',
    ...overrides,
  };
}

const FINDINGS_DIGEST = `sha256:${'c'.repeat(64)}`;

describe('summarizeAuditEvidenceQuality', () => {
  it('is undefined without a quality assessment, the no-graph case', () => {
    expect(
      summarizeAuditEvidenceQuality({
        quality: undefined,
        auditRoot: undefined,
        approval: undefined,
      }),
    ).toBeUndefined();
  });

  it('is undefined for a quality file this build cannot interpret', () => {
    expect(
      summarizeAuditEvidenceQuality({
        quality: { verdict: 'something-new' },
        auditRoot: undefined,
        approval: undefined,
      }),
    ).toBeUndefined();
    expect(
      summarizeAuditEvidenceQuality({ quality: 'not-json', auditRoot: undefined, approval: null }),
    ).toBeUndefined();
  });

  it('summarizes blocking codes with their reference counts and skips limitations', () => {
    const summary = summarizeAuditEvidenceQuality({
      quality: quality(),
      auditRoot: undefined,
      approval: undefined,
    });
    expect(summary?.verdict).toBe('failed');
    expect(summary?.blockingCodes).toEqual([
      'environment-unapproved',
      'temporal-coherence-unverified',
    ]);
    expect(summary?.blockingCounts).toEqual({
      'environment-unapproved': 1,
      'temporal-coherence-unverified': 2,
    });
    expect(summary?.limitationCount).toBe(1);
    expect(summary?.approval).toBe('missing');
    expect(summary?.approvalDigest).toBeUndefined();
  });

  it('merges one code raised by several issues into one count', () => {
    const summary = summarizeAuditEvidenceQuality({
      quality: quality({
        issues: [
          { code: 'unresolved-material-gap', severity: 'blocking', evidenceRefs: ['a', 'b'] },
          { code: 'unresolved-material-gap', severity: 'blocking', evidenceRefs: ['c'] },
        ],
      }),
      auditRoot: undefined,
      approval: undefined,
    });
    expect(summary?.blockingCodes).toEqual(['unresolved-material-gap']);
    expect(summary?.blockingCounts).toEqual({ 'unresolved-material-gap': 3 });
  });

  it('approves only when the approval names the roots beside it and these findings', () => {
    const summary = summarizeAuditEvidenceQuality({
      quality: quality({
        verdict: 'reportable-complete',
        issues: [],
        mandatoryDisclosures: [],
      }),
      auditRoot: auditRoot(),
      approval: approval(),
      confirmedFindingsDigest: FINDINGS_DIGEST,
    });
    expect(summary?.approval).toBe('approved');
    expect(summary?.approvalDigest).toBe(reportQualityDigest(approval()));
    expect(summary?.blockingCodes).toEqual([]);
  });

  it('marks an approval stale when the audit root was replaced', () => {
    const summary = summarizeAuditEvidenceQuality({
      quality: quality({ verdict: 'reportable-complete', issues: [], mandatoryDisclosures: [] }),
      auditRoot: auditRoot({ digest: `sha256:${'d'.repeat(64)}` }),
      approval: approval(),
      confirmedFindingsDigest: FINDINGS_DIGEST,
    });
    expect(summary?.approval).toBe('stale');
    expect(summary?.approvalDigest).toBeUndefined();
  });

  it('marks an approval stale when it references another quality assessment', () => {
    const summary = summarizeAuditEvidenceQuality({
      quality: quality({ verdict: 'reportable-complete', issues: [], mandatoryDisclosures: [] }),
      auditRoot: auditRoot(),
      approval: approval({ evidenceQualityAssessmentDigest: `sha256:${'e'.repeat(64)}` }),
      confirmedFindingsDigest: FINDINGS_DIGEST,
    });
    expect(summary?.approval).toBe('stale');
  });

  it('marks an approval stale when the findings it approved were replaced', () => {
    const summary = summarizeAuditEvidenceQuality({
      quality: quality({ verdict: 'reportable-complete', issues: [], mandatoryDisclosures: [] }),
      auditRoot: auditRoot({ confirmedFindingsDigest: `sha256:${'f'.repeat(64)}` }),
      approval: approval(),
      confirmedFindingsDigest: FINDINGS_DIGEST,
    });
    expect(summary?.approval).toBe('stale');
  });

  it('skips the findings comparison when the caller pins a bundle instead', () => {
    const summary = summarizeAuditEvidenceQuality({
      quality: quality({ verdict: 'reportable-complete', issues: [], mandatoryDisclosures: [] }),
      auditRoot: auditRoot({ confirmedFindingsDigest: `sha256:${'f'.repeat(64)}` }),
      approval: approval(),
    });
    expect(summary?.approval).toBe('approved');
  });
});
