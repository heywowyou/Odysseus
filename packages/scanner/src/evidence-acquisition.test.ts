import { describe, expect, it, vi } from 'vitest';
import {
  appendCheckAttempt,
  appendSelectionDecision,
  checkAttemptLedgerDigest,
  createCheckAttemptLedger,
  type AcquisitionAttemptRecord,
} from './check-attempt-ledger.js';
import {
  acquireSiteCheck,
  assembleCheckAttemptLedger,
  classifyCheckFailure,
  lighthouseAttemptRecord,
  materialResultDigest,
  mergeRetriedChecks,
  PAGE_CHECK_IDS,
  pageAttemptRecords,
  retryRequestsFor,
} from './evidence-acquisition.js';

const scopeDigest = `sha256:${'b'.repeat(64)}`;
const url = 'https://hotel.example/rooms';
const context = (profile: 'normal' | 'isolated-retry' | 'diagnostic-retry', minute: number) => ({
  url,
  surfaceId: 'surface:desktop',
  scopeDigest,
  evidenceEpoch: 1,
  startedAt: new Date(Date.UTC(2026, 8, 18, 10, minute)),
  finishedAt: new Date(Date.UTC(2026, 8, 18, 10, minute, 30)),
  executionProfile: profile,
});

describe('classifyCheckFailure', () => {
  it.each([
    ['page.goto: Timeout 30000ms exceeded', 'scanner-timeout'],
    ['watchdog: page analysis did not complete within 420000ms', 'scanner-timeout'],
    ['Target page, context or browser has been closed', 'browser-environment-error'],
    ['navigation answered HTTP 404', 'site-http-state'],
    ['HTTP 503', 'origin-transient-error'],
    ['HTTP 429', 'anti-bot-rate-limit'],
    ['scanSite: network safety blocked http://10.0.0.1/ (refused-address)', 'network-safety-block'],
    ['net::ERR_CONNECTION_RESET at https://hotel.example/', 'origin-transient-error'],
    ['dependency: CrUX quota exceeded', 'dependency-error'],
    ['Cannot read properties of undefined', 'tool-error'],
  ])('%s -> %s', (message, failureClass) => {
    expect(classifyCheckFailure(message).failureClass).toBe(failureClass);
  });
});

describe('materialResultDigest', () => {
  it('ignores axe timing and pass lists but not a changed violation target', () => {
    const base = {
      url,
      axe: {
        timestamp: '2026-09-18T10:00:00Z',
        passes: [{ id: 'color-contrast' }],
        violations: [{ id: 'image-alt', impact: 'critical', nodes: [{ target: ['img.a'] }] }],
        incomplete: [],
      },
    };
    const retimed = {
      ...base,
      axe: { ...base.axe, timestamp: '2026-09-18T11:00:00Z', passes: [] },
    };
    const moved = {
      ...base,
      axe: {
        ...base.axe,
        violations: [{ id: 'image-alt', impact: 'critical', nodes: [{ target: ['img.b'] }] }],
      },
    };
    expect(materialResultDigest('axe', retimed as never)).toBe(
      materialResultDigest('axe', base as never),
    );
    expect(materialResultDigest('axe', moved as never)).not.toBe(
      materialResultDigest('axe', base as never),
    );
  });
});

describe('pageAttemptRecords and retryRequestsFor', () => {
  it('records a check with no outcome as a failure rather than dropping it', () => {
    const records = pageAttemptRecords(
      { url },
      { 'render-diff': 'completed' },
      context('normal', 0),
      ['render-diff', 'reflow'],
    );
    expect(records.find((record) => record.checkId === 'reflow')).toMatchObject({
      outcome: 'failed',
      failureClass: 'unknown',
      diagnosticCode: 'outcome-missing',
    });
  });

  it('asks for a fresh context after a tool error and nothing after a success', () => {
    const records = pageAttemptRecords(
      { url, axeError: 'axe injection failed' },
      { 'render-diff': 'completed', axe: 'failed' },
      context('normal', 0),
      ['render-diff', 'axe'],
    );
    expect(retryRequestsFor(records)).toEqual([{ checkId: 'axe', nextProfile: 'isolated-retry' }]);
  });

  it('stops after the ladder runs out', () => {
    const first = pageAttemptRecords(
      { url, axeError: 'boom' },
      { 'render-diff': 'completed', axe: 'failed' },
      context('normal', 0),
      ['axe'],
    );
    const second = pageAttemptRecords(
      { url, axeError: 'boom' },
      { 'render-diff': 'completed', axe: 'failed' },
      context('isolated-retry', 1),
      ['axe'],
    );
    const third = pageAttemptRecords(
      { url, axeError: 'boom' },
      { 'render-diff': 'completed', axe: 'failed' },
      context('diagnostic-retry', 2),
      ['axe'],
    );
    expect(retryRequestsFor([...first, ...second])).toEqual([
      { checkId: 'axe', nextProfile: 'diagnostic-retry' },
    ]);
    expect(retryRequestsFor([...first, ...second, ...third])).toEqual([]);
  });

  it('covers every page check the rendered pass owns', () => {
    expect(PAGE_CHECK_IDS).toContain('axe');
    expect(PAGE_CHECK_IDS).not.toContain('lighthouse');
    expect(PAGE_CHECK_IDS).not.toContain('llms-txt-check');
  });
});

describe('mergeRetriedChecks', () => {
  it('replaces only checks the retry completed', () => {
    const merged = mergeRetriedChecks(
      {
        url,
        axeError: 'boom',
        altTextError: 'boom',
        headMetadata: { title: 'kept' } as never,
        checkOutcomes: { axe: 'failed', 'alt-text': 'failed', 'head-metadata': 'completed' },
      },
      { url, axe: { violations: [] } as never, altTextError: 'again', headMetadata: {} as never },
      { axe: 'completed', 'alt-text': 'failed', 'head-metadata': 'completed' },
      ['axe', 'alt-text'],
    );
    expect(merged.page.axe).toEqual({ violations: [] });
    expect(merged.page.axeError).toBeUndefined();
    expect(merged.page.altTextError).toBe('boom');
    expect(merged.page.headMetadata).toEqual({ title: 'kept' });
    expect(merged.checkOutcomes).toMatchObject({ axe: 'completed', 'alt-text': 'failed' });
  });

  it('takes the observations of a recovered navigation from the retry', () => {
    const readiness = { outcome: 'ready' } as never;
    const anchor = { digest: 'sha256:retry' } as never;
    const frames = [{ frameUrl: 'https://booking.example/' }] as never;
    const merged = mergeRetriedChecks(
      {
        url,
        renderDiffError: 'nav-timeout',
        axeError: 'nav-timeout',
        checkOutcomes: { 'render-diff': 'failed', axe: 'failed' },
      },
      {
        url,
        renderDiff: {} as never,
        axe: { violations: [] } as never,
        readiness,
        structuralAnchor: anchor,
        frames,
      },
      { 'render-diff': 'completed', axe: 'completed' },
      ['render-diff', 'axe'],
    );
    expect(merged.page.readiness).toBe(readiness);
    expect(merged.page.structuralAnchor).toBe(anchor);
    expect(merged.page.frames).toBe(frames);
  });
});

function succeeded(minute: number, digest: string): AcquisitionAttemptRecord {
  return {
    checkId: 'axe',
    target: { kind: 'page', url },
    surfaceId: 'surface:desktop',
    scopeDigest,
    evidenceEpoch: 1,
    startedAt: new Date(Date.UTC(2026, 8, 18, 10, minute)).toISOString(),
    finishedAt: new Date(Date.UTC(2026, 8, 18, 10, minute, 30)).toISOString(),
    executionProfile: minute === 0 ? 'normal' : 'isolated-retry',
    sourceArtifactDigest: null,
    outcome: 'succeeded',
    materialResultDigest: digest,
  };
}

describe('assembleCheckAttemptLedger', () => {
  it('produces the same attempt identities as the incremental ledger API', () => {
    const record = succeeded(0, 'sha256:x');
    const { ledger } = assembleCheckAttemptLedger(1, [record]);
    const incremental = appendCheckAttempt(createCheckAttemptLedger(1), {
      ...record,
      startedAt: new Date(record.startedAt),
      finishedAt: new Date(record.finishedAt),
    } as never);
    expect(ledger.attempts[0]!.attemptId).toBe(incremental.attempt.attemptId);
    const accepted = appendSelectionDecision(incremental.ledger, {
      attemptId: incremental.attempt.attemptId,
      state: 'accepted',
      decidedBy: 'deterministic',
      reasonCode: 'sole-success',
      decidedAt: new Date(record.finishedAt),
    });
    expect(checkAttemptLedgerDigest(ledger)).toBe(checkAttemptLedgerDigest(accepted));
  });

  it('is independent of record order', () => {
    const records = [succeeded(0, 'sha256:x'), succeeded(1, 'sha256:x')];
    expect(checkAttemptLedgerDigest(assembleCheckAttemptLedger(1, records).ledger)).toBe(
      checkAttemptLedgerDigest(assembleCheckAttemptLedger(1, [...records].reverse()).ledger),
    );
  });

  it('accepts nothing when successes disagree', () => {
    const { ledger, resolutions } = assembleCheckAttemptLedger(1, [
      succeeded(0, 'sha256:x'),
      succeeded(1, 'sha256:y'),
    ]);
    expect([...resolutions.values()][0]!.kind).toBe('unstable-result');
    expect(ledger.selections).toEqual([]);
  });

  it('moves the digest when a different attempt set is accepted', () => {
    const agreeing = assembleCheckAttemptLedger(1, [succeeded(0, 'sha256:x')]);
    const retried = assembleCheckAttemptLedger(1, [
      succeeded(0, 'sha256:x'),
      succeeded(1, 'sha256:x'),
    ]);
    expect(checkAttemptLedgerDigest(retried.ledger)).not.toBe(
      checkAttemptLedgerDigest(agreeing.ledger),
    );
  });

  it('refuses a record from another evidence epoch', () => {
    expect(() => assembleCheckAttemptLedger(2, [succeeded(0, 'sha256:x')])).toThrow(/epoch/);
  });
});

describe('acquireSiteCheck', () => {
  const siteContext = {
    origin: 'https://hotel.example',
    surfaceId: 'surface:site-request',
    scopeDigest,
    evidenceEpoch: 1,
    retry: true,
  };

  it('retries a transient failure up the ladder and records each attempt', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ value: 'a', material: 'a', failure: 'HTTP 503' })
      .mockResolvedValueOnce({ value: 'b', material: 'b' });
    const { value, records } = await acquireSiteCheck('llms-txt-check', siteContext, run);
    expect(value).toBe('b');
    expect(run.mock.calls.map((call) => call[0])).toEqual(['normal', 'isolated-retry']);
    expect(records.map((record) => record.outcome)).toEqual(['failed', 'succeeded']);
  });

  it('makes a single request when retry is off', async () => {
    const run = vi.fn().mockResolvedValue({ value: 'a', material: 'a', failure: 'HTTP 503' });
    await acquireSiteCheck('llms-txt-check', { ...siteContext, retry: false }, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('records then rethrows a policy refusal', async () => {
    const run = vi.fn().mockRejectedValue(new Error('network safety blocked (refused-address)'));
    await expect(acquireSiteCheck('llms-txt-check', siteContext, run)).rejects.toMatchObject({
      acquisitionAttempts: [expect.objectContaining({ failureClass: 'network-safety-block' })],
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('lighthouseAttemptRecord', () => {
  it('keys each measurement-set member separately', () => {
    const record = lighthouseAttemptRecord({
      url,
      runIndex: 2,
      scopeDigest,
      evidenceEpoch: 1,
      startedAt: new Date(0),
      finishedAt: new Date(1),
      executionProfile: 'normal',
      lighthouse: { categories: { performance: { score: 0.5 } }, audits: {} },
      lighthouseError: undefined,
    });
    expect(record).toMatchObject({
      outcome: 'succeeded',
      target: { kind: 'performance', performanceProfile: 'lab-run-2' },
    });
  });
});
