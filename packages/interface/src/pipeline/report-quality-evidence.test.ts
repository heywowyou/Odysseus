import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FINDINGS_SCHEMA_VERSION,
  type ApprovedAuditEvidence,
  type AuditManifest,
  type Finding,
  type Sha256Digest,
} from '@odysseus/core';
import { confirmedFindingsDigest } from '@odysseus/scanner';
import { loadAuditEvidencePayload } from './report-quality-evidence.js';

const stored = vi.hoisted(() => ({
  approval: undefined as unknown,
  audit: undefined as unknown,
  quality: undefined as unknown,
}));

vi.mock('@odysseus/scanner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/scanner')>()),
  readApprovedAuditEvidence: vi.fn(() => stored.approval),
  readAuditEvidenceSnapshot: vi.fn(() => stored.audit),
  readEvidenceQualityAssessment: vi.fn(() => stored.quality),
}));

const AUDIT_ID = 'audit-loader-test';
const AUDIT_DIGEST = `sha256:${'a'.repeat(64)}` as Sha256Digest;
const QUALITY_DIGEST = `sha256:${'b'.repeat(64)}` as Sha256Digest;

const FINDING: Finding = {
  findingId: 'finding-image-alt',
  auditId: AUDIT_ID,
  schemaVersion: FINDINGS_SCHEMA_VERSION,
  source: 'axe',
  ruleId: 'image-alt',
  category: 'accessibility',
  severity: 'serious',
  wcagCriteria: [],
  title: '',
  description: '',
  pageUrls: ['https://hotel-exemple.fr/'],
  occurrences: 1,
  elements: [],
  rawEvidence: {},
  dedupeKey: 'image-alt',
  firstSeenAt: new Date(0),
  lastSeenAt: new Date(0),
};

const MANIFEST = { auditId: AUDIT_ID } as AuditManifest;

const DISCLOSURE = {
  limitationId: 'limitation:robots-disallowed-pages',
  code: 'robots-disallowed-pages',
  summary: { fr: 'Une page…', en: 'One page…' },
  reportDestination: 'section-11',
  evidenceRefs: ['https://hotel-exemple.fr/prive'],
};

function approval(overrides: Partial<ApprovedAuditEvidence> = {}): ApprovedAuditEvidence {
  return {
    auditId: AUDIT_ID,
    evidenceEpoch: 1,
    rawEvidenceSnapshotDigest: `sha256:${'c'.repeat(64)}` as Sha256Digest,
    auditEvidenceSnapshotDigest: AUDIT_DIGEST,
    evidenceQualityAssessmentDigest: QUALITY_DIGEST,
    verdict: 'reportable-with-known-limitations',
    limitations: [DISCLOSURE],
    evidenceCoverageSignature: {} as ApprovedAuditEvidence['evidenceCoverageSignature'],
    capabilityRegistryVersion: 'test',
    approvalMode: 'system',
    approvedAt: '2026-09-18T09:31:00.000Z',
    approvedBySystemVersion: 'test-build:evidence-approval-policy-v1',
    ...overrides,
  };
}

function load() {
  return loadAuditEvidencePayload({ auditDir: '/unused', manifest: MANIFEST, findings: [FINDING] });
}

beforeEach(() => {
  stored.approval = approval();
  stored.audit = {
    digest: AUDIT_DIGEST,
    confirmedFindingsDigest: confirmedFindingsDigest([FINDING]),
  };
  stored.quality = {
    digest: QUALITY_DIGEST,
    verdict: 'reportable-with-known-limitations',
    issues: [],
  };
});

describe('loadAuditEvidencePayload', () => {
  it('passes a system approval through with its mandatory disclosures', () => {
    const payload = load();
    expect(payload.approval.approvalMode).toBe('system');
    expect(payload.mandatoryDisclosures).toEqual([DISCLOSURE]);
  });

  it('refuses an audit whose evidence was assessed and not approved', () => {
    stored.approval = undefined;
    stored.quality = {
      digest: QUALITY_DIGEST,
      verdict: 'failed',
      issues: [
        { code: 'environment-unapproved', severity: 'blocking' },
        { code: 'temporal-coherence-unverified', severity: 'blocking' },
      ],
    };
    expect(load).toThrow(
      'Plan 059 evidence was assessed failed and not approved: environment-unapproved, temporal-coherence-unverified',
    );
  });

  it('refuses an approval that points at another audit root', () => {
    stored.audit = { digest: `sha256:${'d'.repeat(64)}`, confirmedFindingsDigest: '' };
    expect(load).toThrow('approval does not match the audit evidence root');
  });

  it('refuses an approval that points at another quality assessment', () => {
    stored.quality = {
      digest: `sha256:${'e'.repeat(64)}`,
      verdict: 'reportable-complete',
      issues: [],
    };
    expect(load).toThrow('approval does not match the quality assessment');
  });

  it('refuses findings changed after approval', () => {
    stored.audit = { digest: AUDIT_DIGEST, confirmedFindingsDigest: confirmedFindingsDigest([]) };
    expect(load).toThrow('findings changed after evidence approval');
  });

  it('refuses a legacy-adapter approval written to the canonical location', () => {
    stored.approval = approval({ approvalMode: 'legacy-adapter' });
    expect(load).toThrow('legacy adapter');
  });
});
