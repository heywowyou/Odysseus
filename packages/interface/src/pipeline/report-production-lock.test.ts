import { describe, expect, it } from 'vitest';
import {
  isAnyReportProductionInFlight,
  isReportProductionInFlight,
  isWritingRegenerationInFlight,
  releaseReportProduction,
  tryAcquireReportProduction,
} from './report-production-lock.js';

describe('report production lock', () => {
  it('refuses a second run of either kind while one holds the audit', () => {
    expect(tryAcquireReportProduction('lock-a', 'report-ready')).toBe(true);
    expect(tryAcquireReportProduction('lock-a', 'writing')).toBe(false);
    expect(tryAcquireReportProduction('lock-a', 'report-ready')).toBe(false);
    expect(isReportProductionInFlight('lock-a')).toBe(true);
    releaseReportProduction('lock-a', 'report-ready');
  });

  it('lets a new run start once the holder releases', () => {
    expect(tryAcquireReportProduction('lock-b', 'writing')).toBe(true);
    releaseReportProduction('lock-b', 'writing');
    expect(isReportProductionInFlight('lock-b')).toBe(false);
    expect(isAnyReportProductionInFlight()).toBe(false);
    expect(tryAcquireReportProduction('lock-b', 'report-ready')).toBe(true);
    releaseReportProduction('lock-b', 'report-ready');
  });

  it('keeps the lock when released under the other run kind', () => {
    expect(tryAcquireReportProduction('lock-c', 'writing')).toBe(true);
    releaseReportProduction('lock-c', 'report-ready');
    expect(isReportProductionInFlight('lock-c')).toBe(true);
    releaseReportProduction('lock-c', 'writing');
  });

  it('reports a writing regeneration only for a writing run', () => {
    tryAcquireReportProduction('lock-d', 'report-ready');
    expect(isWritingRegenerationInFlight('lock-d')).toBe(false);
    releaseReportProduction('lock-d', 'report-ready');
    tryAcquireReportProduction('lock-d', 'writing');
    expect(isWritingRegenerationInFlight('lock-d')).toBe(true);
    releaseReportProduction('lock-d', 'writing');
  });
});
