import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@odysseus/scanner', () => ({
  launchBrowser: vi.fn(),
  scanSite: vi.fn(),
  writeAuditArtifacts: vi.fn(),
  writeFindingsFile: vi.fn(),
  pruneScreenshots: vi.fn(),
  buildAuditDir: vi.fn(() => '/artifacts/example.com/2026-08-04T00-00-00Z'),
  getArtifactsRoot: vi.fn(() => '/artifacts'),
  getCrawlDelayMs: vi.fn(() => 1000),
  getCrawlerUserAgent: vi.fn(() => 'OdysseusAuditBot/0.1'),
  getLighthouseTimeoutMs: vi.fn(() => 60_000),
  getMaxCrawlDepth: vi.fn(() => 5),
  getMaxPages: vi.fn(() => 20),
  getPageTimeoutMs: vi.fn(() => 30_000),
  getScanConcurrency: vi.fn(() => 3),
}));
vi.mock('@odysseus/core', () => ({ normalizeAudit: vi.fn() }));
vi.mock('@odysseus/store', () => ({ persistAudit: vi.fn() }));
vi.mock('./obligation-stage.js', () => ({ runObligationStage: vi.fn() }));

import {
  buildAuditDir,
  launchBrowser,
  pruneScreenshots,
  scanSite,
  writeAuditArtifacts,
  writeFindingsFile,
} from '@odysseus/scanner';
import { normalizeAudit } from '@odysseus/core';
import { persistAudit } from '@odysseus/store';
import { runObligationStage } from './obligation-stage.js';
import { runAuditStage } from './audit-stage.js';

const browserClose = vi.fn();
const fakeBrowser = { close: browserClose } as never;
const fakeConnection = {} as never;

function fakeManifest() {
  return {
    auditId: 'audit-123',
    kind: 'audit' as const,
    siteUrl: 'https://example.com/',
    crawl: { startUrl: 'https://example.com/' },
    pages: [
      { url: 'https://example.com/', pageDir: 'home-abc123', renderDiffMissingPercent: 0 },
      { url: 'https://example.com/about', pageDir: 'about-def456', renderDiffMissingPercent: 10 },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(launchBrowser).mockResolvedValue({ browser: fakeBrowser, debugPort: 9222 });
  vi.mocked(scanSite).mockResolvedValue({
    crawl: { visitedCount: 2, startUrl: 'https://example.com/', pages: [], maxPages: 20, maxDepth: 5, robotsTxtFound: true, effectiveDelayMs: 1000 },
    pages: [],
  } as never);
  vi.mocked(writeAuditArtifacts).mockResolvedValue({
    auditId: 'audit-123',
    auditDir: '/artifacts/example.com/2026-08-04T00-00-00Z',
    manifest: fakeManifest(),
    pages: [],
  } as never);
  vi.mocked(normalizeAudit).mockReturnValue([{ findingId: 'f1' }] as never);
  vi.mocked(writeFindingsFile).mockResolvedValue(undefined);
  vi.mocked(pruneScreenshots).mockResolvedValue({ prunedPageDirs: ['about-def456'] } as never);
  vi.mocked(persistAudit).mockResolvedValue(undefined);
  vi.mocked(runObligationStage).mockResolvedValue({ status: 'undetermined', basis: [] });
});

describe('runAuditStage', () => {
  it('runs scan -> writeAuditArtifacts -> normalize -> writeFindings -> prune -> persist, in order', async () => {
    const calls: string[] = [];
    vi.mocked(scanSite).mockImplementation(async () => {
      calls.push('scanSite');
      return { crawl: { visitedCount: 2 }, pages: [] } as never;
    });
    vi.mocked(writeAuditArtifacts).mockImplementation(async () => {
      calls.push('writeAuditArtifacts');
      return { auditId: 'audit-123', auditDir: '/dir', manifest: fakeManifest(), pages: [] } as never;
    });
    vi.mocked(runObligationStage).mockImplementation(async () => {
      calls.push('runObligationStage');
      return { status: 'undetermined', basis: [] };
    });
    vi.mocked(normalizeAudit).mockImplementation(() => {
      calls.push('normalizeAudit');
      return [] as never;
    });
    vi.mocked(writeFindingsFile).mockImplementation(async () => {
      calls.push('writeFindingsFile');
    });
    vi.mocked(pruneScreenshots).mockImplementation(async () => {
      calls.push('pruneScreenshots');
      return { prunedPageDirs: [] } as never;
    });
    vi.mocked(persistAudit).mockImplementation(async () => {
      calls.push('persistAudit');
    });

    await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(calls).toEqual([
      'scanSite',
      'writeAuditArtifacts',
      'runObligationStage',
      'normalizeAudit',
      'writeFindingsFile',
      'pruneScreenshots',
      'persistAudit',
    ]);
  });

  it('calls runObligationStage with the manifest writeAuditArtifacts produced, and threads its result into the result', async () => {
    vi.mocked(runObligationStage).mockResolvedValue({
      status: 'in_scope',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [] }],
    });

    const result = await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(runObligationStage).toHaveBeenCalledWith(fakeManifest(), fakeConnection, undefined, undefined);
    expect(result.obligationAssessment).toEqual({
      status: 'in_scope',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [] }],
    });
  });

  it('passes options.manualSiren through to runObligationStage', async () => {
    await runAuditStage('https://example.com/', { manualSiren: '732829320' }, fakeConnection);

    expect(runObligationStage).toHaveBeenCalledWith(fakeManifest(), fakeConnection, '732829320', undefined);
  });

  it('passes options.siteSignalOverrides through to runObligationStage', async () => {
    const siteSignalOverrides = { hasTransactionalFlow: { value: true, reason: 'confirmed by hand' } };
    await runAuditStage('https://example.com/', { siteSignalOverrides }, fakeConnection);

    expect(runObligationStage).toHaveBeenCalledWith(fakeManifest(), fakeConnection, undefined, siteSignalOverrides);
  });

  it('passes maxPages/maxDepth through to scanSite when provided', async () => {
    await runAuditStage('https://example.com/', { maxPages: 5, maxDepth: 1 }, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ maxPages: 5, maxDepth: 1 }),
    );
  });

  it('omits maxPages/maxDepth from scanSite options when not provided', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    const options = vi.mocked(scanSite).mock.calls[0]?.[1];
    expect(options).not.toHaveProperty('maxPages');
    expect(options).not.toHaveProperty('maxDepth');
  });

  it('forwards onProgress to scanSite when provided', async () => {
    const onProgress = vi.fn();
    await runAuditStage('https://example.com/', { onProgress }, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith('https://example.com/', expect.objectContaining({ onProgress }));
  });

  it('derives pruneScreenshots input from the manifest, marking the crawl start URL as the homepage', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(pruneScreenshots).toHaveBeenCalledWith('/artifacts/example.com/2026-08-04T00-00-00Z', [
      { pageUrl: 'https://example.com/', pageDir: 'home-abc123', missingPercent: 0, isHomepage: true },
      { pageUrl: 'https://example.com/about', pageDir: 'about-def456', missingPercent: 10, isHomepage: false },
    ]);
  });

  it('returns the expected result shape', async () => {
    const result = await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(result).toEqual({
      auditId: 'audit-123',
      manifest: fakeManifest(),
      findings: [{ findingId: 'f1' }],
      auditDir: '/artifacts/example.com/2026-08-04T00-00-00Z',
      visitedCount: 2,
      prunedPageDirCount: 1,
      obligationAssessment: { status: 'undetermined', basis: [] },
    });
  });

  it('closes the browser even if scanSite throws', async () => {
    vi.mocked(scanSite).mockRejectedValueOnce(new Error('boom'));

    await expect(runAuditStage('https://example.com/', {}, fakeConnection)).rejects.toThrow('boom');
    expect(browserClose).toHaveBeenCalledTimes(1);
  });

  it('builds the screenshot dir from buildAuditDir + hostname + startedAt', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(buildAuditDir).toHaveBeenCalledWith('/artifacts', 'example.com', expect.any(Date));
    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ screenshotDir: '/artifacts/example.com/2026-08-04T00-00-00Z/pages' }),
    );
  });
});
