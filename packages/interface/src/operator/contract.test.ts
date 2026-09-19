import { describe, expect, it } from 'vitest';
import {
  ATTENTION_KINDS,
  ATTENTION_SEVERITIES,
  OPERATOR_EVIDENCE_READINESS,
  OPERATOR_REPORT_READINESS,
  operatorAttentionItemSchema,
  operatorSnapshotSchema,
} from './contract.js';

describe('plan 060 readiness axes', () => {
  it('keeps evidence and report readiness as independent axes', () => {
    // Plan 060 §5.1: the four authorities are never flattened into one
    // enum, so each axis carries its own closed values.
    expect([...OPERATOR_EVIDENCE_READINESS]).toEqual([
      'unavailable',
      'legacy-unknown',
      'building',
      'limited',
      'complete',
      'superseded',
    ]);
    expect([...OPERATOR_REPORT_READINESS]).toEqual([
      'absent',
      'producing',
      'needs-attention',
      'quality-approved',
      'awaiting-operator-approval',
      'operator-approved',
      'active',
      'failed',
      'superseded',
    ]);
  });

  it('keeps the work-state axis separate from both readiness axes', () => {
    const shared = (OPERATOR_EVIDENCE_READINESS as readonly string[]).filter((value) =>
      (OPERATOR_REPORT_READINESS as readonly string[]).includes(value),
    );
    // Only the historical/supersession term is shared; approval language
    // no longer exists on the evidence axis.
    expect(shared).toEqual(['superseded']);
  });
});

describe('operatorAttentionItemSchema', () => {
  it('accepts a truthful item and requires the safe action', () => {
    const item = {
      attentionId: 'report-quality-review:audit-1:run-7',
      kind: 'report-delivery-approval',
      severity: 'blocking',
      subject: { prospectId: 'p1', auditId: 'audit-1' },
      createdAt: '2026-09-18T10:00:00.000Z',
      updatedAt: '2026-09-18T10:00:00.000Z',
      action: 'approveReportBundle',
      href: '/audits/audit-1',
    };
    expect(operatorAttentionItemSchema.parse(item)).toEqual(item);
    expect(operatorAttentionItemSchema.safeParse({ ...item, href: undefined }).success).toBe(false);
  });

  it('covers every kind and severity', () => {
    expect(ATTENTION_KINDS.length).toBeGreaterThan(0);
    expect([...ATTENTION_SEVERITIES]).toEqual(['action-required', 'blocking']);
  });
});

describe('operatorSnapshotSchema', () => {
  const capability = {
    state: 'blocked',
    stateToken: 't',
    reasonCode: 'work-running',
  } as const;

  it('composes the four authorities without flattening them', () => {
    const snapshot = {
      subject: { prospectId: 'p1', auditId: 'a1', siteLabel: 'Hôtel du Parc' },
      work: [
        {
          workId: 'job-1',
          owner: 'legacy-job',
          purpose: 'full-scan',
          state: 'failed',
          subject: { prospectId: 'p1', auditId: 'a1' },
          createdAt: '2026-09-18T09:00:00.000Z',
          updatedAt: '2026-09-18T09:05:00.000Z',
          issue: {
            category: 'report-quality',
            reason: 'report-failed',
            retryable: false,
          },
        },
      ],
      evidence: { readiness: 'unavailable' },
      report: { readiness: 'failed' },
      capabilities: { startFullScan: { state: 'available', stateToken: 't1' } },
      attention: [],
      stateVersion: 'v1',
    };
    const parsed = operatorSnapshotSchema.parse(snapshot);
    // A failed report run sits next to independently declared evidence
    // readiness: run state and artifact readiness are different dimensions.
    expect(parsed.work[0]?.state).toBe('failed');
    expect(parsed.evidence.readiness).toBe('unavailable');
    expect(parsed.report.readiness).toBe('failed');
    expect(parsed.capabilities.startFullScan).toEqual({ state: 'available', stateToken: 't1' });
  });

  it('refuses a capability that is not the common shape', () => {
    expect(
      operatorSnapshotSchema.safeParse({
        subject: {},
        work: [],
        evidence: { readiness: 'unavailable' },
        report: { readiness: 'absent' },
        capabilities: { startFullScan: { state: 'available' } },
        attention: [],
        stateVersion: 'v1',
      }).success,
    ).toBe(false);
    expect(capability).toBeDefined();
  });

  it('requires the state version token', () => {
    expect(
      operatorSnapshotSchema.safeParse({
        subject: {},
        work: [],
        evidence: { readiness: 'unavailable' },
        report: { readiness: 'absent' },
        capabilities: {},
        attention: [],
      }).success,
    ).toBe(false);
  });
});
