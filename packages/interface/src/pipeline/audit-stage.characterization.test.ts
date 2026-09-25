import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stage = vi.hoisted(() => ({
  root: '',
  closeBrowser: vi.fn(),
  scanSite: vi.fn(),
  writeAuditArtifacts: vi.fn(),
  pruneScreenshots: vi.fn(),
  writeFindingsFile: vi.fn(),
  writeManifestFile: vi.fn(),
  runEvidenceGraphStage: vi.fn(),
  isCurrent: vi.fn(),
  persistAudit: vi.fn(),
  prefillAuditManualFields: vi.fn(),
  replaceDetectedManualFields: vi.fn(),
  normalizeAudit: vi.fn(),
  calls: [] as string[],
}));

vi.mock('@odysseus/scanner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/scanner')>();
  return {
    ...actual,
    assertAcquisitionLease: vi.fn(),
    buildAuditDir: (_root: string, _hostname: string, _startedAt: Date) =>
      path.join(stage.root, 'audit'),
    getArtifactsRoot: () => stage.root,
    getCrawlDelayMs: () => 1000,
    getCrawlerUserAgent: () => 'OdysseusBot/test',
    getLighthouseTimeoutMs: () => 10_000,
    getRenderSettleTimeoutMs: () => 1000,
    getMaxCrawlDepth: () => 4,
    getMaxPages: () => 20,
    getPageTimeoutMs: () => 5000,
    getScanConcurrency: () => 2,
    launchBrowser: vi.fn(async () => ({
      browser: { close: stage.closeBrowser, version: () => 'test' },
      debugPort: 0,
      launchArgs: [],
    })),
    pruneScreenshots: stage.pruneScreenshots,
    PUBLIC_SITE_NETWORK_POLICY: {
      id: 'public-site',
      allowsPrivateAddresses: false,
      allowHosts: new Set(),
    },
    runEvidenceGraphStage: stage.runEvidenceGraphStage,
    scanSite: stage.scanSite,
    writeAcquisitionLease: vi.fn(),
    writeAuditArtifacts: stage.writeAuditArtifacts,
    writeFindingsFile: stage.writeFindingsFile,
    writeManifestFile: stage.writeManifestFile,
  };
});

vi.mock('@odysseus/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/core')>();
  return {
    ...actual,
    buildFindingsProvenance: vi.fn(() => ({
      findingsSchemaVersion: 1,
      normalizationFingerprint: 'test-fingerprint',
      findingsDigest: 'sha256:test',
    })),
    deriveCoverageLimitations: vi.fn(() => []),
    normalizeAudit: stage.normalizeAudit,
    summarizeAuditCoverage: vi.fn(() => ({ visitedPageCount: 1 })),
  };
});

vi.mock('@odysseus/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/store')>();
  return {
    ...actual,
    persistAudit: vi.fn(async () => stage.calls.push('persist')),
    prefillAuditManualFields: vi.fn(async () => stage.calls.push('prefill')),
    replaceDetectedManualFields: vi.fn(async () => stage.calls.push('detected-prefill')),
  };
});

vi.mock('./obligation-stage.js', () => ({
  runObligationStage: vi.fn(async () => ({})),
}));
vi.mock('./audit-scope-stage.js', () => ({
  buildRunAuditScope: vi.fn(() => ({ digest: 'scope-test' })),
}));
vi.mock('../artifacts/configured-artifact-store.js', () => ({
  createConfiguredArtifactStore: vi.fn(() => ({})),
}));
vi.mock('../artifacts/sync-audit-artifacts.js', () => ({
  syncAuditDirToBucket: vi.fn(async () => stage.calls.push('sync')),
}));

import { normalizeAudit } from '@odysseus/core';
import { persistAudit } from '@odysseus/store';
import { runAuditStage } from './audit-stage.js';

const URL = 'https://example.com/';
const FINDINGS = [
  {
    findingId: 'finding-1',
    ruleId: 'image-alt',
    severity: 'serious',
    pageUrls: [URL],
    elements: [],
  },
];
const MANIFEST = {
  auditId: 'audit-stage-characterization',
  kind: 'audit',
  siteUrl: URL,
  startedAt: '2026-09-24T10:00:00.000Z',
  finishedAt: '2026-09-24T10:01:00.000Z',
  tool: {},
  config: {},
  crawl: {
    startUrl: URL,
    homepageUrl: URL,
    visitedCount: 1,
    maxPages: 20,
    maxDepth: 4,
    robotsTxtFound: true,
    effectiveDelayMs: 1000,
  },
  pages: [
    {
      url: URL,
      pageDir: 'pages/home',
      depth: 0,
      status: 'visited',
      discoveryMethod: 'link',
      analysisCoverage: {},
      errors: {},
    },
  ],
  translationClusters: [{ urls: [URL] }],
} as never;

beforeEach(async () => {
  stage.root = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-audit-stage-'));
  stage.calls.length = 0;
  vi.clearAllMocks();
  stage.isCurrent.mockResolvedValue(true);
  stage.closeBrowser.mockResolvedValue(undefined);
  stage.scanSite.mockResolvedValue({
    crawl: { startUrl: URL, visitedCount: 1, pages: [{ url: URL, status: 'visited' }] },
    pages: [],
  });
  stage.writeAuditArtifacts.mockResolvedValue({
    auditId: 'audit-stage-characterization',
    auditDir: path.join(stage.root, 'audit'),
    manifest: MANIFEST,
    pages: [{ url: URL, axe: { violations: [] } }],
  });
  stage.pruneScreenshots.mockResolvedValue({ prunedPageDirs: [] });
  stage.writeFindingsFile.mockResolvedValue(undefined);
  stage.writeManifestFile.mockResolvedValue(undefined);
  stage.runEvidenceGraphStage.mockReturnValue(undefined);
  stage.normalizeAudit.mockReturnValue(FINDINGS);
});

afterEach(async () => {
  await fs.rm(stage.root, { recursive: true, force: true });
});

describe('runAuditStage characterization', () => {
  it('normalizes the homepage identity and persists before syncing and prefill', async () => {
    const result = await runAuditStage(URL, { skipLighthouse: true }, {} as never);

    expect(result.auditId).toBe('audit-stage-characterization');
    expect(normalizeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        auditId: result.auditId,
        pages: [{ url: URL, axe: { violations: [] } }],
        crawl: expect.objectContaining({ startUrl: URL, homepageUrl: URL }),
        translationClusters: [{ urls: [URL] }],
      }),
    );
    expect(persistAudit).toHaveBeenCalledTimes(1);
    expect(stage.calls).toEqual(['persist', 'sync', 'prefill', 'detected-prefill']);
    expect(stage.closeBrowser).toHaveBeenCalledTimes(1);
  });

  it('aborts after a stale claim before writing or persisting audit data', async () => {
    stage.isCurrent.mockResolvedValue(false);

    await expect(
      runAuditStage(
        URL,
        {
          acquisitionClaim: { claimId: 'stale-claim', isCurrent: stage.isCurrent },
        },
        {} as never,
      ),
    ).rejects.toThrow(/held by another worker/u);

    expect(stage.writeAuditArtifacts).not.toHaveBeenCalled();
    expect(persistAudit).not.toHaveBeenCalled();
    expect(stage.closeBrowser).toHaveBeenCalledTimes(1);
  });

  it('persists the audit when optional evidence-graph assembly throws', async () => {
    stage.runEvidenceGraphStage.mockImplementation(() => {
      throw new Error('diagnostic graph unavailable');
    });

    await expect(runAuditStage(URL, {}, {} as never)).resolves.toMatchObject({
      auditId: 'audit-stage-characterization',
      findings: FINDINGS,
    });

    expect(stage.runEvidenceGraphStage).toHaveBeenCalledTimes(1);
    expect(persistAudit).toHaveBeenCalledTimes(1);
  });
});
