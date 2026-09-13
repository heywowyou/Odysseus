import { describe, expect, it } from 'vitest';
import { auditTodoAction, isNeedsInputJob } from './todo-model.js';

describe('isNeedsInputJob', () => {
  it('is true for a job stored as needs-input', () => {
    expect(isNeedsInputJob({ status: 'needs-input' })).toBe(true);
  });

  it('is true for a failed job that persisted an audit (issue #90)', () => {
    expect(isNeedsInputJob({ status: 'failed', auditId: 'audit-1' })).toBe(true);
  });

  it('is false for a failed job with no persisted audit', () => {
    expect(isNeedsInputJob({ status: 'failed' })).toBe(false);
  });

  it('is false for every other status', () => {
    for (const status of ['queued', 'running', 'complete', 'cancelled'] as const) {
      expect(isNeedsInputJob({ status, auditId: 'audit-1' })).toBe(false);
    }
  });
});

describe('auditTodoAction', () => {
  const clear = {
    hasUnconfirmedIdentityFields: false,
    hasNoReportLanguages: false,
    hasNoApproval: false,
  };

  it('returns null once every gate is clear', () => {
    expect(auditTodoAction(clear)).toBeNull();
  });

  it('asks to confirm identity first, even when PDFs and approval are also missing', () => {
    expect(
      auditTodoAction({
        ...clear,
        hasUnconfirmedIdentityFields: true,
        hasNoReportLanguages: true,
        hasNoApproval: true,
      }),
    ).toBe('confirm-identity');
  });

  it('asks to generate PDFs once identity is confirmed but no report exists', () => {
    expect(auditTodoAction({ ...clear, hasNoReportLanguages: true, hasNoApproval: true })).toBe(
      'generate-pdfs',
    );
  });

  it('asks to approve the pair once PDFs exist but nothing is approved', () => {
    expect(auditTodoAction({ ...clear, hasNoApproval: true })).toBe('approve-pair');
  });
});
