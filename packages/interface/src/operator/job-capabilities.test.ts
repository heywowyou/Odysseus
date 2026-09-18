import { describe, expect, it } from 'vitest';
import type { JobStatus, JobType } from '@odysseus/store';
import { actionCapabilitySchema } from './contract.js';
import {
  cancelJobCapability,
  deleteJobCapability,
  type JobCapabilityInputs,
} from './job-capabilities.js';

const STATUSES: JobStatus[] = [
  'queued',
  'running',
  'cancel-requested',
  'complete',
  'failed',
  'cancelled',
  'needs-input',
];

function inputs(
  job: Partial<JobCapabilityInputs['job']> = {},
  local: Partial<Omit<JobCapabilityInputs, 'job'>> = {},
): JobCapabilityInputs {
  return {
    job: { jobId: 'job-1', type: 'full-audit', status: 'cancelled', ...job },
    inFlight: false,
    reportProductionInFlight: false,
    ...local,
  };
}

describe('cancelJobCapability', () => {
  it('offers removal while queued and a safe-boundary stop while running', () => {
    expect(cancelJobCapability(inputs({ status: 'queued' }))).toMatchObject({
      state: 'available',
      consequenceCode: 'removes-from-queue',
    });
    expect(cancelJobCapability(inputs({ status: 'running' }))).toMatchObject({
      state: 'available',
      consequenceCode: 'stops-at-safe-boundary',
    });
  });

  it('blocks a repeated stop and every terminal state', () => {
    expect(cancelJobCapability(inputs({ status: 'cancel-requested' }))).toMatchObject({
      state: 'blocked',
      reasonCode: 'cancel-already-requested',
    });
    for (const status of ['complete', 'failed', 'cancelled', 'needs-input'] as const) {
      expect(cancelJobCapability(inputs({ status }))).toMatchObject({
        state: 'blocked',
        reasonCode: 'already-terminal',
      });
    }
  });

  it('blocks stopping a running runner that never checks for a stop', () => {
    for (const type of ['outreach-draft-batch', 'outreach-followup-batch'] as JobType[]) {
      expect(cancelJobCapability(inputs({ status: 'running', type }))).toMatchObject({
        state: 'blocked',
        reasonCode: 'not-stoppable',
      });
    }
  });

  it('changes its token with the status and keeps it across irrelevant inputs', () => {
    const tokens = new Set(
      STATUSES.map((status) => cancelJobCapability(inputs({ status })).stateToken),
    );
    expect(tokens.size).toBe(STATUSES.length);
    const base = cancelJobCapability(inputs({ status: 'running' })).stateToken;
    expect(
      cancelJobCapability(inputs({ status: 'running', auditId: 'audit-9' }, { inFlight: true }))
        .stateToken,
    ).toBe(base);
  });
});

describe('deleteJobCapability', () => {
  it('blocks running, stopping and still-finishing work with the blocking job', () => {
    for (const status of ['running', 'cancel-requested'] as const) {
      expect(deleteJobCapability(inputs({ status }))).toMatchObject({
        state: 'blocked',
        reasonCode: 'work-running',
        blockingRef: { workId: 'job-1' },
      });
    }
    expect(deleteJobCapability(inputs({}, { inFlight: true }))).toMatchObject({
      state: 'blocked',
      reasonCode: 'work-finishing',
    });
    expect(deleteJobCapability(inputs({}, { reportProductionInFlight: true }))).toMatchObject({
      state: 'blocked',
      reasonCode: 'report-production-in-flight',
    });
  });

  it('names whether audits go with the row', () => {
    expect(deleteJobCapability(inputs({ status: 'queued' }))).toMatchObject({
      consequenceCode: 'deletes-history-only',
    });
    expect(deleteJobCapability(inputs({ status: 'complete', auditId: 'a' }))).toMatchObject({
      consequenceCode: 'deletes-audits',
    });
  });

  it('changes its token on every deciding input', () => {
    const base = deleteJobCapability(inputs()).stateToken;
    const variants = [
      inputs({ status: 'failed' }),
      inputs({}, { inFlight: true }),
      inputs({}, { reportProductionInFlight: true }),
      inputs({ auditId: 'audit-1' }),
      inputs({ auditIds: ['audit-2'] }),
    ];
    for (const variant of variants) {
      expect(deleteJobCapability(variant).stateToken).not.toBe(base);
    }
    // Audit order is not a deciding input.
    expect(deleteJobCapability(inputs({ auditIds: ['a', 'b'] })).stateToken).toBe(
      deleteJobCapability(inputs({ auditIds: ['b', 'a'] })).stateToken,
    );
  });

  it('always serializes to the shared capability schema', () => {
    for (const status of STATUSES) {
      for (const inFlight of [false, true]) {
        const input = inputs({ status }, { inFlight });
        expect(actionCapabilitySchema.safeParse(cancelJobCapability(input)).success).toBe(true);
        expect(actionCapabilitySchema.safeParse(deleteJobCapability(input)).success).toBe(true);
      }
    }
  });
});
