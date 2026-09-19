import { describe, expect, it } from 'vitest';
import {
  operatorSnapshotSchema,
  type ActionCapability,
  type OperatorAttentionItem,
  type OperatorWorkView,
} from './contract.js';
import { buildAuditSnapshot, type AuditSnapshotInputs } from './audit-snapshot.js';
import type { EvidenceFacts, ReportQualityFacts } from './audit-readiness.js';

const EVIDENCE_UNAVAILABLE: EvidenceFacts = {};
const EVIDENCE_COMPLETE: EvidenceFacts = { diagnosticsStatus: 'complete' };
const REPORT_IDLE: ReportQualityFacts = {};
const REPORT_RUNNING: ReportQualityFacts = { runState: 'running', runRef: 'run-1' };

function workView(overrides: Partial<OperatorWorkView> = {}): OperatorWorkView {
  return {
    workId: 'job-1',
    owner: 'legacy-job',
    purpose: 'full-scan',
    state: 'running',
    subject: { auditId: 'audit-1' },
    createdAt: '2026-09-18T08:00:00.000Z',
    updatedAt: '2026-09-18T08:30:00.000Z',
    ...overrides,
  };
}

function snapshotInputs(overrides: Partial<AuditSnapshotInputs> = {}): AuditSnapshotInputs {
  return {
    subject: { prospectId: 'prospect-1', auditId: 'audit-1', siteLabel: 'Hôtel du Parc' },
    work: [workView()],
    evidenceFacts: EVIDENCE_UNAVAILABLE,
    reportFacts: REPORT_IDLE,
    capabilities: {},
    attention: [],
    ...overrides,
  };
}

describe('buildAuditSnapshot', () => {
  it('composes a snapshot that validates against operatorSnapshotSchema', () => {
    const snapshot = buildAuditSnapshot(
      snapshotInputs({
        evidenceFacts: EVIDENCE_COMPLETE,
        reportFacts: { candidateDigest: 'sha256:' + 'b'.repeat(64) },
      }),
    );
    expect(operatorSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshot.evidence).toEqual({ readiness: 'complete' });
    expect(snapshot.report).toEqual({
      readiness: 'quality-approved',
      candidateDigest: 'sha256:' + 'b'.repeat(64),
    });
    expect(snapshot.subject).toEqual({
      prospectId: 'prospect-1',
      auditId: 'audit-1',
      siteLabel: 'Hôtel du Parc',
    });
    expect(snapshot.stateVersion).toMatch(/^[\w-]{22}$/);
  });

  it('passes work views, capabilities and attention through untouched', () => {
    const work: OperatorWorkView[] = [workView({ state: 'failed', workId: 'job-2' })];
    const capabilities: Record<string, ActionCapability> = {
      cancel: { state: 'blocked', stateToken: 'tok-1', reasonCode: 'already-terminal' },
    };
    const attention: OperatorAttentionItem[] = [
      {
        attentionId: 'report-quality-review:audit-1:run-1',
        kind: 'report-quality-review',
        severity: 'action-required',
        subject: { auditId: 'audit-1' },
        createdAt: '2026-09-18T09:00:00.000Z',
        updatedAt: '2026-09-18T09:00:00.000Z',
        action: 'reviewReportQuality',
        href: '/audits/audit-1',
      },
    ];
    const snapshot = buildAuditSnapshot(snapshotInputs({ work, capabilities, attention }));
    expect(snapshot.work).toEqual(work);
    expect(snapshot.capabilities).toEqual(capabilities);
    expect(snapshot.attention).toEqual(attention);
  });

  it('fails loudly instead of returning an invalid snapshot', () => {
    const inputs = snapshotInputs({
      capabilities: {
        cancel: { state: 'available' },
      } as unknown as AuditSnapshotInputs['capabilities'],
    });
    expect(() => buildAuditSnapshot(inputs)).toThrow();
  });

  it('changes stateVersion when a report run state flips', () => {
    const before = buildAuditSnapshot(snapshotInputs({ reportFacts: REPORT_RUNNING }));
    const after = buildAuditSnapshot(
      snapshotInputs({ reportFacts: { ...REPORT_RUNNING, runState: 'failed' } }),
    );
    expect(after.stateVersion).not.toBe(before.stateVersion);
  });

  it('changes stateVersion when evidence diagnostics become complete', () => {
    const before = buildAuditSnapshot(snapshotInputs({ evidenceFacts: EVIDENCE_UNAVAILABLE }));
    const after = buildAuditSnapshot(snapshotInputs({ evidenceFacts: EVIDENCE_COMPLETE }));
    expect(after.stateVersion).not.toBe(before.stateVersion);
  });

  it('changes stateVersion when a digest changes', () => {
    const before = buildAuditSnapshot(
      snapshotInputs({ reportFacts: { activeDigest: 'sha256:' + 'c'.repeat(64) } }),
    );
    const after = buildAuditSnapshot(
      snapshotInputs({ reportFacts: { activeDigest: 'sha256:' + 'd'.repeat(64) } }),
    );
    expect(after.stateVersion).not.toBe(before.stateVersion);
  });

  it('changes stateVersion when work state changes but not when only display fields do', () => {
    const before = buildAuditSnapshot(snapshotInputs());
    const afterStateChange = buildAuditSnapshot(
      snapshotInputs({ work: [workView({ state: 'failed' })] }),
    );
    expect(afterStateChange.stateVersion).not.toBe(before.stateVersion);

    // The display label and the work row's heartbeat fields are not
    // authoritative inputs: a poll tick must never invalidate a click.
    const relabelled = buildAuditSnapshot(
      snapshotInputs({
        subject: { prospectId: 'prospect-1', auditId: 'audit-1', siteLabel: 'Nouveau nom' },
      }),
    );
    expect(relabelled.stateVersion).toBe(before.stateVersion);
    const heartbeat = buildAuditSnapshot(
      snapshotInputs({ work: [workView({ updatedAt: '2026-09-18T08:45:00.000Z' })] }),
    );
    expect(heartbeat.stateVersion).toBe(before.stateVersion);
  });

  it('is deterministic for identical inputs', () => {
    expect(buildAuditSnapshot(snapshotInputs()).stateVersion).toBe(
      buildAuditSnapshot(snapshotInputs()).stateVersion,
    );
  });
});
