import { describe, expect, it } from 'vitest';
import {
  clearReportProduction,
  markReportProductionCompleted,
  markReportProductionFailed,
  markReportProductionStage,
  reportProductionState,
} from './report-production-state.js';

describe('report production state (issue #376)', () => {
  it('moves through writing and PDF generation keeping the start time', () => {
    const auditId = 'state-flow';
    expect(reportProductionState(auditId)).toEqual({ status: 'idle' });
    markReportProductionStage(auditId, 'writing');
    const writing = reportProductionState(auditId);
    markReportProductionStage(auditId, 'pdf-generation');
    const pdf = reportProductionState(auditId);
    expect(pdf.status).toBe('pdf-generation');
    expect(pdf).toMatchObject({ startedAt: (writing as { startedAt: string }).startedAt });
    markReportProductionCompleted(auditId);
    expect(reportProductionState(auditId).status).toBe('completed');
  });

  it('records a failure against the running stage, and clears to idle', () => {
    const auditId = 'state-failure';
    markReportProductionStage(auditId, 'writing');
    markReportProductionFailed(auditId, new Error('quota exceeded'));
    expect(reportProductionState(auditId)).toMatchObject({
      status: 'failed',
      stage: 'writing',
      message: 'quota exceeded',
    });
    clearReportProduction(auditId);
    expect(reportProductionState(auditId)).toEqual({ status: 'idle' });
  });
});
