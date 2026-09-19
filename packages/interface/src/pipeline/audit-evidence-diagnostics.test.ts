import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_REASON_CLASSIFICATION,
  summarizeAuditEvidenceDiagnostics,
} from './audit-evidence-diagnostics.js';

const ROOT = {
  auditId: 'foch',
  evidenceEpoch: 1,
  digest: 'sha256:audit-root',
};

function quality(issues: unknown[]) {
  return {
    auditId: 'foch',
    evidenceEpoch: 1,
    auditEvidenceSnapshotDigest: ROOT.digest,
    issues,
  };
}

function issue(code: string, refs: string[] = ['ref-1'], disclosure?: unknown) {
  return { code, evidenceRefs: refs, ...(disclosure === undefined ? {} : { disclosure }) };
}

describe('Plan 068 evidence diagnostics', () => {
  it('classifies every emitted reason code exactly once', () => {
    expect(Object.keys(EVIDENCE_REASON_CLASSIFICATION).sort()).toEqual([
      'capability-gap-undisclosed',
      'consistency-gate-failed',
      'disclosed-scope-limitation',
      'environment-unapproved',
      'inventory-unreconciled',
      'legacy-evidence-insufficient',
      'network-safety-preflight-failed',
      'operator-resolution-required',
      'performance-confidence-insufficient',
      'raw-evidence-invalid',
      'robots-policy-unresolved',
      'site-level-unknown',
      'temporal-coherence-unverified',
      'temporal-drift',
      'unresolved-material-gap',
      'unstable-material-result',
    ]);
  });

  it('projects the Foch-shaped assessment as limited while separating environment diagnostics', () => {
    const result = summarizeAuditEvidenceDiagnostics({
      auditRoot: ROOT,
      quality: quality([
        issue('environment-unapproved'),
        issue('site-level-unknown', ['site:security-headers']),
        issue('unresolved-material-gap', ['page:booking']),
        issue('temporal-drift', ['temporal:home']),
      ]),
    });
    expect(result.status).toBe('limited');
    expect(result.operationalWarnings).toEqual([
      { code: 'environment-unapproved', referenceCount: 1 },
    ]);
    expect(result.clientLimitations.map((entry) => entry.code).sort()).toEqual([
      'site-level-unknown',
      'temporal-drift',
      'unresolved-material-gap',
    ]);
  });

  it('keeps an environment warning operational-only and complete for report claims', () => {
    expect(
      summarizeAuditEvidenceDiagnostics({
        auditRoot: ROOT,
        quality: quality([issue('environment-unapproved')]),
      }),
    ).toEqual({
      status: 'complete',
      clientLimitations: [],
      operationalWarnings: [{ code: 'environment-unapproved', referenceCount: 1 }],
    });
  });

  it.each(['site-level-unknown', 'unresolved-material-gap', 'temporal-drift'] as const)(
    '%s narrows the report instead of invalidating it',
    (code) => {
      const result = summarizeAuditEvidenceDiagnostics({
        auditRoot: ROOT,
        quality: quality([issue(code)]),
      });
      expect(result.status).toBe('limited');
      expect(result.clientLimitations).toHaveLength(1);
    },
  );

  it('reuses an existing disclosure verbatim when one is present', () => {
    const disclosure = {
      limitationId: 'limitation:stored',
      code: 'stored-copy',
      summary: { fr: 'Copie historique.', en: 'Historical copy.' },
      reportDestination: 'section-11',
      evidenceRefs: ['stored-ref'],
    };
    const result = summarizeAuditEvidenceDiagnostics({
      auditRoot: ROOT,
      quality: quality([issue('unresolved-material-gap', ['new-ref'], disclosure)]),
    });
    expect(result.clientLimitations).toEqual([disclosure]);
  });

  it('maps an old blocking issue with no disclosure without rewriting its artifact', () => {
    const result = summarizeAuditEvidenceDiagnostics({
      auditRoot: ROOT,
      quality: quality([issue('site-level-unknown', ['legacy-ref'])]),
    });
    expect(result.clientLimitations[0]).toMatchObject({
      code: 'site-level-unknown',
      evidenceRefs: ['legacy-ref'],
    });
    expect(result.clientLimitations[0]?.summary.fr.length).toBeGreaterThan(20);
    expect(result.clientLimitations[0]?.summary.en.length).toBeGreaterThan(20);
  });

  it('treats missing or inconsistent diagnostics as unavailable, never as audit invalid', () => {
    expect(
      summarizeAuditEvidenceDiagnostics({ quality: undefined, auditRoot: undefined }).status,
    ).toBe('unavailable');
    expect(
      summarizeAuditEvidenceDiagnostics({
        quality: quality([]),
        auditRoot: { ...ROOT, digest: 'sha256:other-root' },
      }).status,
    ).toBe('unavailable');
    expect(
      summarizeAuditEvidenceDiagnostics({
        quality: quality([issue('consistency-gate-failed')]),
        auditRoot: ROOT,
      }).status,
    ).toBe('unavailable');
  });
});
