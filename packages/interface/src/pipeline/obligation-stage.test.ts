import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../sirene/sirene-cache.js', () => ({ lookupOperatorProfile: vi.fn() }));

import { lookupOperatorProfile } from '../sirene/sirene-cache.js';
import { runObligationStage } from './obligation-stage.js';
import type { AuditManifest, OperatorProfile } from '@odysseus/core';

const fakeConnection = {} as never;

function fakeManifest(overrides: Partial<AuditManifest> = {}): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00.000Z',
    finishedAt: '2026-08-02T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '130.0.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: [],
    ...overrides,
  } as AuditManifest;
}

function foundProfile(overrides: Partial<OperatorProfile> = {}): OperatorProfile {
  const retrievedAt = new Date('2026-01-01T00:00:00.000Z');
  return {
    siren: { value: '732829320', source: 'sirene-api', retrievedAt },
    denomination: { value: 'Test Co', source: 'sirene-api', retrievedAt },
    naf: { value: '62.01Z', source: 'sirene-api', retrievedAt },
    legalForm: { value: 'SAS', source: 'sirene-api', retrievedAt },
    effectifBand: { value: { code: '22', label: '100 a 199 salaries' }, source: 'sirene-api', retrievedAt },
    turnover: { value: null, source: 'sirene-api:turnover-unreliable-for-band', retrievedAt },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runObligationStage', () => {
  it('is undetermined without a network call when the manifest has no SIREN', async () => {
    const result = await runObligationStage(fakeManifest(), fakeConnection);
    expect(result.status).toBe('undetermined');
    expect(lookupOperatorProfile).not.toHaveBeenCalled();
    expect(result.sector).toBe('general');
  });

  it('is undetermined when the Sirene lookup fails, without throwing', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'api-unreachable', siren: '732829320', detail: 'x' });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: false, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection);
    expect(result.status).toBe('undetermined');
    expect(result.sector).toBe('general');
  });

  it('resolves a found profile with the manifest siteSignals', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection);
    expect(result.status).toBe('in_scope');
    expect(result.sector).toBe('general');
  });

  it('resolves sector: hospitality from a hospitality NAF code', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({
      status: 'found',
      profile: foundProfile({ naf: { value: '55.10Z', source: 'sirene-api', retrievedAt: new Date() } }),
    });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection);
    expect(result.sector).toBe('hospitality');
  });

  it('degrades to undetermined rather than throwing when the lookup itself throws', async () => {
    vi.mocked(lookupOperatorProfile).mockRejectedValue(new Error('mongo down'));
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection);
    expect(result.status).toBe('undetermined');
    expect(result.sector).toBe('general');
  });

  it('2026-08-22 revenue-impact wiring: carries turnoverEur onto registrySnapshot when Sirene marked it reliable', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({
      status: 'found',
      profile: foundProfile({ turnover: { value: 500_000, source: 'sirene-api', retrievedAt: new Date() } }),
    });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection);
    expect(result.registrySnapshot?.turnoverEur).toBe(500_000);
  });

  it('2026-08-22: omits turnoverEur entirely when Sirene marked the effectif band unreliable for turnover', async () => {
    // foundProfile()'s default turnover is { value: null, source:
    // 'sirene-api:turnover-unreliable-for-band' } - the common case for
    // most of Odysseus's SMB client base.
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection);
    expect(result.registrySnapshot).toBeDefined();
    expect(result.registrySnapshot?.turnoverEur).toBeUndefined();
  });

  it('tags sirenSource: extracted when only an extracted SIREN is present', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection);
    expect(result.sirenSource).toBe('extracted');
    expect(result.sirenMismatch).toBeUndefined();
  });
});

describe('runObligationStage with a manual SIREN', () => {
  it('uses the manual SIREN, tagged accordingly, when no SIREN was extracted', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile({ siren: { value: '552032534', source: 'sirene-api', retrievedAt: new Date() } }) });
    const manifest = fakeManifest({
      siteSignals: { hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection, '552032534');

    expect(lookupOperatorProfile).toHaveBeenCalledWith(fakeConnection, '552032534');
    expect(result.status).toBe('in_scope');
    expect(result.sirenSource).toBe('manual');
    expect(result.sirenMismatch).toBeUndefined();
  });

  it('tags sirenSource: extracted, with no mismatch, when both are present and equal', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection, '732829320');

    expect(lookupOperatorProfile).toHaveBeenCalledWith(fakeConnection, '732829320');
    expect(result.sirenSource).toBe('extracted');
    expect(result.sirenMismatch).toBeUndefined();
  });

  it('uses the manual SIREN and attaches a mismatch note when both are present and differ', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile({ siren: { value: '552032534', source: 'sirene-api', retrievedAt: new Date() } }) });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection, '552032534');

    expect(lookupOperatorProfile).toHaveBeenCalledWith(fakeConnection, '552032534');
    expect(result.sirenSource).toBe('manual');
    expect(result.sirenMismatch).toEqual({ extractedSiren: '732829320', manualSiren: '552032534' });
  });

  it('degrades to undetermined without falling back to the extracted SIREN when the manual lookup fails', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'not-found', siren: '552032534' });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection, '552032534');

    expect(lookupOperatorProfile).toHaveBeenCalledTimes(1);
    expect(lookupOperatorProfile).toHaveBeenCalledWith(fakeConnection, '552032534');
    expect(result.status).toBe('undetermined');
    expect(result.sirenSource).toBe('manual');
  });

  it('ignores a manual SIREN that fails the checksum, falling back to whatever the extraction found', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection, '000000001');

    expect(lookupOperatorProfile).toHaveBeenCalledWith(fakeConnection, '732829320');
    expect(result.sirenSource).toBe('extracted');
  });
});

describe('runObligationStage with a manual hasTransactionalFlow override', () => {
  it('uses the manual value, tagged as source manual, when there is no detected siteSignals at all', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest();

    const result = await runObligationStage(manifest, fakeConnection, '732829320', {
      hasTransactionalFlow: { value: true, reason: 'confirmed by hand' },
    });

    expect(result.status).toBe('in_scope');
    expect(result.siteSignalResolutions?.['hasTransactionalFlow']).toEqual({
      value: true,
      source: 'manual',
      reason: 'confirmed by hand',
    });
  });

  it('uses the manual value false, tagged as source manual, with no detector signal', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest();

    const result = await runObligationStage(manifest, fakeConnection, '732829320', {
      hasTransactionalFlow: { value: false },
    });

    expect(result.status).toBe('out_of_scope');
    expect(result.siteSignalResolutions?.['hasTransactionalFlow']).toEqual({ value: false, source: 'manual' });
  });

  it('leaves the detected-only behavior unchanged when no override is supplied', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: true, transactionalFlowEvidence: [] },
    });

    const result = await runObligationStage(manifest, fakeConnection);

    expect(result.status).toBe('in_scope');
    expect(result.siteSignalResolutions?.['hasTransactionalFlow']).toEqual({ value: true, source: 'detected' });
  });

  it('lets a manual true win over a detected false, tagged manual, and records the disagreement', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'found', profile: foundProfile() });
    const manifest = fakeManifest({
      siteSignals: { siren: '732829320', hasTransactionalFlow: false, transactionalFlowEvidence: [] },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await runObligationStage(manifest, fakeConnection, undefined, {
      hasTransactionalFlow: { value: true, reason: 'redirects to a dedicated booking engine' },
    });

    expect(result.status).toBe('in_scope');
    expect(result.siteSignalResolutions?.['hasTransactionalFlow']).toEqual({
      value: true,
      source: 'manual',
      reason: 'redirects to a dedicated booking engine',
      detectedValue: false,
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('never lets the override set status directly - it still runs through assessObligations via siteSignals', async () => {
    // The exempt profile (small headcount) forces out_of_scope on EAA's
    // own terms regardless of siteSignals - a manual hasTransactionalFlow
    // override must not bypass that, since only siteSignals is what the
    // override ever touches.
    vi.mocked(lookupOperatorProfile).mockResolvedValue({
      status: 'found',
      profile: foundProfile({
        effectifBand: { value: { code: '01', label: '1 a 2 salaries' }, source: 'sirene-api', retrievedAt: new Date() },
        turnover: { value: 100_000, source: 'sirene-api', retrievedAt: new Date() },
      }),
    });
    const manifest = fakeManifest();

    const result = await runObligationStage(manifest, fakeConnection, '732829320', {
      hasTransactionalFlow: { value: true },
    });

    expect(result.status).toBe('out_of_scope');
  });
});
