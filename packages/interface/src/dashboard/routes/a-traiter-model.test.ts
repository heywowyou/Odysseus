import { describe, expect, it } from 'vitest';
import type { ScanSummary } from '../lib/api-types';
import type { DashboardStrings } from '../i18n/types';
import { A_TRAITER_ROW_LIMIT, draftTouchName, needsInputScans } from './a-traiter-model';

function scan(overrides: Partial<ScanSummary>): ScanSummary {
  return {
    jobId: 'job-1',
    type: 'full-audit',
    status: 'complete',
    phase: 'done',
    createdAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

const EMAIL_LABELS: DashboardStrings['hub']['emails'] = {
  followUpName: 'Relance {n}',
  firstEmailName: 'Premier email',
  needsReviewNotice: '',
  noPendingDraft: '',
};

describe('needsInputScans', () => {
  it('keeps only rows whose display status is needs-input', () => {
    const rows = [
      scan({ jobId: 'j-live', status: 'running' }),
      // Issue #90: a failed job whose audit was persisted displays as
      // needs-input even though the API status stays failed.
      scan({
        jobId: 'j-failed-with-audit',
        status: 'failed',
        auditId: 'audit-1',
        createdAt: '2026-09-01T09:00:00.000Z',
      }),
      scan({ jobId: 'j-failed-bare', status: 'failed' }),
      scan({ jobId: 'j-needs-input', status: 'needs-input', auditId: 'audit-2' }),
    ];
    expect(needsInputScans(rows).map((row) => row.jobId)).toEqual([
      'j-needs-input',
      'j-failed-with-audit',
    ]);
  });

  it('orders newest first without reordering the polled array', () => {
    const rows = [
      scan({ jobId: 'j-old', status: 'needs-input', createdAt: '2026-09-01T08:00:00.000Z' }),
      scan({ jobId: 'j-new', status: 'needs-input', createdAt: '2026-09-02T08:00:00.000Z' }),
    ];
    expect(needsInputScans(rows).map((row) => row.jobId)).toEqual(['j-new', 'j-old']);
    expect(rows.map((row) => row.jobId)).toEqual(['j-old', 'j-new']);
  });
});

describe('draftTouchName', () => {
  it('names touch 1 the first email and touch n follow-up n-1', () => {
    expect(draftTouchName(1, EMAIL_LABELS)).toBe('Premier email');
    expect(draftTouchName(2, EMAIL_LABELS)).toBe('Relance 1');
    expect(draftTouchName(3, EMAIL_LABELS)).toBe('Relance 2');
  });
});

describe('A_TRAITER_ROW_LIMIT', () => {
  it('keeps every short list bounded', () => {
    expect(A_TRAITER_ROW_LIMIT).toBe(5);
  });
});
