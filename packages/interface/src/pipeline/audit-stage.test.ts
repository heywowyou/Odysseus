import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Plan 002 (issue #132): importOriginal keeps the real crawl checkpoint
// reader and writer, so the survival test below asserts against actual
// disk state; everything with effects the stage drives (browser, scan,
// artifact writes) stays a stub.
vi.mock('@odysseus/scanner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/scanner')>()),
  launchBrowser: vi.fn(),
  scanSite: vi.fn(),
  writeAuditArtifacts: vi.fn(),
  writeFindingsFile: vi.fn(),
  writeManifestFile: vi.fn(),
  pruneScreenshots: vi.fn(),
  buildAuditDir: vi.fn(() => '/artifacts/example.com/2026-08-04T00-00-00Z'),
  buildArtifactBucketKey: vi.fn(
    (hostname: string, startedAt: Date, relativePath: string) =>
      `${hostname}/${startedAt.toISOString()}/${relativePath}`,
  ),
  getArtifactsRoot: vi.fn(() => '/artifacts'),
  ensureEnvLoaded: vi.fn(),
  findWorkspaceRoot: vi.fn(() => '/tmp'),
  getCrawlDelayMs: vi.fn(() => 1000),
  getCrawlerUserAgent: vi.fn(() => 'OdysseusAuditBot/0.1'),
  getLighthouseTimeoutMs: vi.fn(() => 60_000),
  getMaxCrawlDepth: vi.fn(() => 5),
  getMaxPages: vi.fn(() => 20),
  getPageTimeoutMs: vi.fn(() => 30_000),
  getRenderSettleTimeoutMs: vi.fn(() => 8_000),
  getScanConcurrency: vi.fn(() => 3),
}));
// normalizeRegistryDisplayName is a pure string function with its own
// unit tests; stubbing it would only let this test pass against a
// display name the real cover would never render. importOriginal keeps
// the real one while normalizeAudit stays a spy.
vi.mock('@odysseus/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@odysseus/core')>()),
  normalizeAudit: vi.fn(),
}));
vi.mock('@odysseus/store', () => ({
  persistAudit: vi.fn(),
  prefillAuditManualFields: vi.fn(),
  replaceDetectedManualFields: vi.fn(),
  linkAuditToHotelByDomain: vi.fn(),
  getHotelQualification: vi.fn(),
}));
vi.mock('./obligation-stage.js', () => ({ runObligationStage: vi.fn() }));
vi.mock('../sirene/sirene-cache.js', () => ({ lookupOperatorProfile: vi.fn() }));

import {
  buildAuditDir,
  launchBrowser,
  pruneScreenshots,
  readCrawlCheckpoint,
  scanSite,
  writeAuditArtifacts,
  writeCrawlCheckpoint,
  writeFindingsFile,
  writeManifestFile,
} from '@odysseus/scanner';
import { buildFindingsProvenance, normalizeAudit } from '@odysseus/core';
import {
  getHotelQualification,
  linkAuditToHotelByDomain,
  persistAudit,
  prefillAuditManualFields,
  replaceDetectedManualFields,
} from '@odysseus/store';
import { runObligationStage } from './obligation-stage.js';
import { lookupOperatorProfile } from '../sirene/sirene-cache.js';
import { resolveCoverPrefill, runAuditStage } from './audit-stage.js';

const browserClose = vi.fn();
const fakeBrowser = { close: browserClose } as never;
const fakeConnection = {} as never;
const defaultAuditDir = path.join(os.tmpdir(), 'odysseus-audit-stage-default');

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

/** The config snapshot is the audit's own disclosure of the pacing that
 *  actually applied, so the clamp tests assert on it as well as on what
 *  scanSite received. */
function capturedConfig() {
  return vi.mocked(writeAuditArtifacts).mock.calls[0]?.[0]?.config;
}

beforeEach(() => {
  vi.clearAllMocks();
  fs.rmSync(defaultAuditDir, { recursive: true, force: true });
  vi.mocked(buildAuditDir).mockReturnValue(defaultAuditDir);
  vi.mocked(launchBrowser).mockResolvedValue({ browser: fakeBrowser, debugPort: 9222 });
  vi.mocked(scanSite).mockResolvedValue({
    crawl: {
      visitedCount: 2,
      startUrl: 'https://example.com/',
      pages: [],
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
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
  vi.mocked(writeManifestFile).mockResolvedValue(undefined);
  vi.mocked(pruneScreenshots).mockResolvedValue({ prunedPageDirs: ['about-def456'] } as never);
  vi.mocked(persistAudit).mockResolvedValue(undefined);
  vi.mocked(runObligationStage).mockResolvedValue({ status: 'undetermined', basis: [] });
  // Plan 045 slice 1.4/1.5 defaults: no hotel match, no qualification join,
  // no Sirene NAF. Individual tests override to exercise the cover-prefill
  // precedence and its NAF gate.
  vi.mocked(linkAuditToHotelByDomain).mockResolvedValue({ candidate: null });
  vi.mocked(getHotelQualification).mockResolvedValue(null);
  vi.mocked(replaceDetectedManualFields).mockResolvedValue({});
  vi.mocked(lookupOperatorProfile).mockResolvedValue({ status: 'not-found', siren: '' } as never);
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
      return {
        auditId: 'audit-123',
        auditDir: '/dir',
        manifest: fakeManifest(),
        pages: [],
      } as never;
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
    vi.mocked(writeManifestFile).mockImplementation(async () => {
      calls.push('writeManifestFile');
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
      'writeManifestFile',
      'pruneScreenshots',
      'persistAudit',
    ]);
  });

  it('creates the audit directory before scanSite can write a crawl frontier checkpoint', async () => {
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-audit-stage-'));
    fs.rmSync(auditDir, { recursive: true, force: true });
    vi.mocked(buildAuditDir).mockReturnValue(auditDir);
    vi.mocked(scanSite).mockImplementation(async (_url, options) => {
      const stateFile = path.join(options.auditDir ?? '', '.crawl-state.json.tmp');
      fs.writeFileSync(stateFile, '{}');
      fs.renameSync(stateFile, path.join(options.auditDir ?? '', 'crawl-state.json'));
      return { crawl: { visitedCount: 2 }, pages: [] } as never;
    });

    try {
      await runAuditStage('https://example.com/', {}, fakeConnection);

      expect(fs.existsSync(path.join(auditDir, 'crawl-state.json'))).toBe(true);
    } finally {
      fs.rmSync(auditDir, { recursive: true, force: true });
    }
  });

  it('stamps the manifest and persistence input with the exact findings provenance', async () => {
    const findings = [{ findingId: 'f1' }] as never;
    vi.mocked(normalizeAudit).mockReturnValue(findings);

    const result = await runAuditStage('https://example.com/', {}, fakeConnection);
    const expected = buildFindingsProvenance(findings);

    expect(result.manifest.findingsProvenance).toEqual(expected);
    expect(writeManifestFile).toHaveBeenCalledWith(result.auditDir, result.manifest);
    expect(persistAudit).toHaveBeenCalledWith(fakeConnection, result.manifest, findings);
  });

  it('calls runObligationStage with the manifest writeAuditArtifacts produced, and threads its result into the result', async () => {
    vi.mocked(runObligationStage).mockResolvedValue({
      status: 'in_scope',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [] }],
    });

    const result = await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(runObligationStage).toHaveBeenCalledWith(
      fakeManifest(),
      fakeConnection,
      undefined,
      undefined,
    );
    expect(result.obligationAssessment).toEqual({
      status: 'in_scope',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [] }],
    });
  });

  it('passes options.manualSiren through to runObligationStage', async () => {
    await runAuditStage('https://example.com/', { manualSiren: '732829320' }, fakeConnection);

    expect(runObligationStage).toHaveBeenCalledWith(
      fakeManifest(),
      fakeConnection,
      '732829320',
      undefined,
    );
  });

  it('passes options.siteSignalOverrides through to runObligationStage', async () => {
    const siteSignalOverrides = {
      hasTransactionalFlow: { value: true, reason: 'confirmed by hand' },
    };
    await runAuditStage('https://example.com/', { siteSignalOverrides }, fakeConnection);

    expect(runObligationStage).toHaveBeenCalledWith(
      fakeManifest(),
      fakeConnection,
      undefined,
      siteSignalOverrides,
    );
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

  // Issue #111: a per-job pacing option may only ever slow the crawl down.
  // The delay is clamped up to the configured CRAWL_DELAY_MS (robots.txt's
  // own crawl-delay stays a further floor inside crawlSite); the scan
  // concurrency is clamped down to the configured SCAN_CONCURRENCY. The
  // config snapshot passed to writeAuditArtifacts must record the effective
  // values, so a report generated under per-site slow pacing is
  // self-documenting like a MAX_PAGES cap.
  it('passes a per-job crawl delay above the configured default through unchanged', async () => {
    await runAuditStage('https://example.com/', { delayMs: 60_000 }, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ delayMs: 60_000 }),
    );
    expect(capturedConfig()?.crawlDelayMs).toBe(60_000);
  });

  it('raises a per-job crawl delay below the configured default up to it', async () => {
    await runAuditStage('https://example.com/', { delayMs: 100 }, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ delayMs: 1000 }),
    );
    expect(capturedConfig()?.crawlDelayMs).toBe(1000);
  });

  it('records the configured default crawl delay when no per-job delay was requested', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    const options = vi.mocked(scanSite).mock.calls[0]?.[1];
    expect(options).not.toHaveProperty('delayMs');
    expect(capturedConfig()?.crawlDelayMs).toBe(1000);
  });

  it('lowers a per-job scan concurrency above the configured default down to it', async () => {
    await runAuditStage('https://example.com/', { scanConcurrency: 10 }, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ concurrency: 3 }),
    );
    expect(capturedConfig()?.scanConcurrency).toBe(3);
  });

  it('passes a per-job scan concurrency at or below the configured default through unchanged', async () => {
    await runAuditStage('https://example.com/', { scanConcurrency: 1 }, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ concurrency: 1 }),
    );
    expect(capturedConfig()?.scanConcurrency).toBe(1);
  });

  it('records the configured default scan concurrency when no per-job value was requested', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    const options = vi.mocked(scanSite).mock.calls[0]?.[1];
    expect(options).not.toHaveProperty('concurrency');
    expect(capturedConfig()?.scanConcurrency).toBe(3);
  });

  it('enables the staged full-audit planner when Lighthouse is not skipped', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ fullAuditPlanning: true }),
    );
  });

  it('never enables the staged full-audit planner when skipLighthouse is set (prospecting)', async () => {
    await runAuditStage('https://example.com/', { skipLighthouse: true }, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ fullAuditPlanning: false, skipLighthouse: true }),
    );
  });

  it('forwards onProgress to scanSite when provided', async () => {
    const onProgress = vi.fn();
    await runAuditStage('https://example.com/', { onProgress }, fakeConnection);

    expect(scanSite).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ onProgress }),
    );
  });

  it('derives pruneScreenshots input from the manifest, marking the crawl start URL as the homepage', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(pruneScreenshots).toHaveBeenCalledWith('/artifacts/example.com/2026-08-04T00-00-00Z', [
      {
        pageUrl: 'https://example.com/',
        pageDir: 'home-abc123',
        missingPercent: 0,
        isHomepage: true,
      },
      {
        pageUrl: 'https://example.com/about',
        pageDir: 'about-def456',
        missingPercent: 10,
        isHomepage: false,
      },
    ]);
  });

  it('returns the expected result shape', async () => {
    const result = await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(result).toEqual({
      auditId: 'audit-123',
      manifest: {
        ...fakeManifest(),
        findingsProvenance: buildFindingsProvenance([{ findingId: 'f1' }] as never),
      },
      findings: [{ findingId: 'f1' }],
      auditDir: '/artifacts/example.com/2026-08-04T00-00-00Z',
      visitedCount: 2,
      prunedPageDirCount: 1,
      coverageSummary: {
        kind: 'legacy-unknown',
        inventoriedUrlCount: 2,
        continuationOmittedUrlCount: 0,
      },
      obligationAssessment: { status: 'undetermined', basis: [] },
    });
  });

  // 2026-08-22, La Corniche report review, updated by plan 045 slice 1.5:
  // siren still feeds prefillAuditManualFields straight from
  // manifest.siteSignals; nomCommercial/raisonSociale now go through
  // replaceDetectedManualFields, falling back to siteSignals.siteName and
  // a NAF-gated registrySnapshot when the audit has no linked hotel.
  it('calls prefillAuditManualFields with siren, and replaceDetectedManualFields with siteName/NAF-gated registrySnapshot candidates', async () => {
    vi.mocked(writeAuditArtifacts).mockResolvedValue({
      auditId: 'audit-123',
      auditDir: '/artifacts/example.com/2026-08-04T00-00-00Z',
      manifest: {
        ...fakeManifest(),
        siteSignals: {
          hasTransactionalFlow: false,
          transactionalFlowEvidence: [],
          siren: '732829320',
          siteName: 'La Co(o)rniche',
        },
      },
      pages: [],
    } as never);
    vi.mocked(runObligationStage).mockResolvedValue({
      status: 'in_scope',
      basis: [],
      sirenSource: 'extracted',
      registrySnapshot: {
        denomination: '(O! DE LA DUNE',
        effectifBandLabel: '100 à 199 salariés',
        retrievedAt: new Date('2026-08-22T00:00:00.000Z'),
        source: 'sirene-api',
      },
    } as never);
    vi.mocked(lookupOperatorProfile).mockResolvedValue({
      status: 'found',
      profile: { naf: { value: '55.10Z' } },
    } as never);

    await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(prefillAuditManualFields).toHaveBeenCalledWith(fakeConnection, 'audit-123', {
      siren: '732829320',
    });
    // A2 (2026-08-24): Sirene returns "(O! DE LA DUNE" with an unbalanced
    // opening parenthesis, which reached a real report cover verbatim.
    // The prefilled display name is normalised; the legal-exposure
    // section keeps reading registrySnapshot.denomination byte-exact,
    // because its own copy claims the name is reproduced as the registry
    // holds it.
    expect(replaceDetectedManualFields).toHaveBeenCalledWith(fakeConnection, 'audit-123', {
      nomCommercial: 'La Co(o)rniche',
      raisonSociale: 'O! DE LA DUNE',
    });
    expect(lookupOperatorProfile).toHaveBeenCalledWith(fakeConnection, '732829320');
  });

  it('omits a candidate field entirely when its source is absent, rather than passing undefined', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(prefillAuditManualFields).toHaveBeenCalledWith(fakeConnection, 'audit-123', {});
    expect(replaceDetectedManualFields).toHaveBeenCalledWith(fakeConnection, 'audit-123', {});
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
      expect.objectContaining({
        screenshotDir: path.join(defaultAuditDir, 'pages'),
      }),
    );
  });

  // Plan 035 (issue #124): the job's run identity drives the audit
  // directory's timestamp and the persisted auditId, so an orphan re-claim
  // of the same job lands in the same directory and reuses what is already
  // on disk.
  it('plan 035: a run identity drives buildAuditDir, writeAuditArtifacts and the auditId', async () => {
    const startedAt = new Date('2026-09-01T08:00:00.000Z');
    const runIdentity = { startedAt, auditId: 'run-audit-42' };

    const result = await runAuditStage('https://example.com/', { runIdentity }, fakeConnection);

    expect(buildAuditDir).toHaveBeenCalledWith('/artifacts', 'example.com', startedAt);
    const writeInput = vi.mocked(writeAuditArtifacts).mock.calls[0]?.[0];
    expect(writeInput?.startedAt).toBe(startedAt);
    expect(writeInput?.auditId).toBe('run-audit-42');
    expect(result.auditDir).toBe('/artifacts/example.com/2026-08-04T00-00-00Z');
  });

  // Plan 002 (issue #132): the checkpoint must survive the audit stage. A
  // crash in a later stage of the same job re-runs this stage, and the
  // checkpoint is the only thing that keeps that re-run from re-crawling
  // the whole site, so the stage itself never deletes it.
  it('leaves the crawl checkpoint on disk when the stage completes', async () => {
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'odysseus-audit-stage-checkpoint-'));
    try {
      vi.mocked(buildAuditDir).mockReturnValue(auditDir);
      vi.mocked(writeAuditArtifacts).mockResolvedValue({
        auditId: 'audit-123',
        auditDir,
        manifest: fakeManifest(),
        pages: [],
      } as never);
      // The real scanSite writes the checkpoint the moment its coverage
      // gate passes; the mock replays that disk effect so the assertion
      // below sees a checkpoint a deletion would have removed.
      vi.mocked(scanSite).mockImplementation(async (_url, options) => {
        writeCrawlCheckpoint(options.auditDir ?? '', {
          checkpointVersion: 'v1',
          startedAt: new Date('2026-09-01T08:00:00.000Z').toISOString(),
          config: {} as never,
          toolIdentity: {
            format: 'full-audit-crawl-checkpoint-v1',
            scannerVersion: 'test',
            plannerVersion: 'v1',
          },
          crawl: { visitedCount: 2 } as never,
        });
        return { crawl: { visitedCount: 2 }, pages: [] } as never;
      });

      const result = await runAuditStage('https://example.com/', {}, fakeConnection);

      expect(result.auditDir).toBe(auditDir);
      expect(readCrawlCheckpoint(auditDir)).toBeDefined();
    } finally {
      fs.rmSync(auditDir, { recursive: true, force: true });
    }
  });

  it('plan 035: without a run identity the stage mints startedAt as before and leaves the auditId mint to writeAuditArtifacts', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    expect(buildAuditDir).toHaveBeenCalledWith('/artifacts', 'example.com', expect.any(Date));
    const writeInput = vi.mocked(writeAuditArtifacts).mock.calls[0]?.[0];
    expect(writeInput).not.toHaveProperty('auditId');
  });

  it('plan 035: passes a checkpointContext carrying the same startedAt and config snapshot given to writeAuditArtifacts', async () => {
    await runAuditStage('https://example.com/', {}, fakeConnection);

    const scanOptions = vi.mocked(scanSite).mock.calls[0]?.[1];
    expect(scanOptions?.checkpointContext?.startedAt).toBeInstanceOf(Date);
    expect(scanOptions?.checkpointContext?.config).toEqual(capturedConfig());
    expect(scanOptions?.onResumeDecision).toBeTypeOf('function');
  });

  it('plan 035: never passes checkpointContext on the prospecting path (skipLighthouse)', async () => {
    await runAuditStage('https://example.com/', { skipLighthouse: true }, fakeConnection);

    const scanOptions = vi.mocked(scanSite).mock.calls[0]?.[1];
    expect(scanOptions).not.toHaveProperty('checkpointContext');
    expect(scanOptions).not.toHaveProperty('onResumeDecision');
  });
});

// Plan 045 slice 1.5: precedence between the linked candidate's own
// catalogue name/qualification join and the audit's own detected sources,
// and the NAF-55 gate that keeps a non-hotel denomination (a web host's
// own registered name, item 3 of plan 045's context) from ever becoming
// the printed raison sociale.
describe('resolveCoverPrefill', () => {
  it('prefers a linked candidate: catalogue name for nomCommercial, its qualification Sirene join for raisonSociale, when the join is a hotel', async () => {
    vi.mocked(getHotelQualification).mockResolvedValue({
      sireneJoin: {
        status: 'matched',
        naf: '55.10Z',
        denomination: 'HÔTEL EXEMPLE (HÔTEL EXEMPLE)',
      },
    } as never);

    const result = await resolveCoverPrefill(
      fakeConnection,
      { candidateId: 'cand-1', name: 'HÔTEL EXEMPLE' } as never,
      { status: 'undetermined', basis: [] },
      undefined,
      undefined,
    );

    expect(getHotelQualification).toHaveBeenCalledWith(fakeConnection, 'v3', 'cand-1');
    expect(result).toEqual({ nomCommercial: 'Hôtel Exemple', raisonSociale: 'HÔTEL EXEMPLE' });
    // The candidate path never needs a fresh Sirene lookup.
    expect(lookupOperatorProfile).not.toHaveBeenCalled();
  });

  it('rejects a non-hotel NAF on the qualification join, and falls back to a NAF-gated registrySnapshot', async () => {
    vi.mocked(getHotelQualification).mockResolvedValue({
      // A web-hosting company's own SIREN, reached through the site's
      // mentions-légales page - exactly item 3's "O2SWITCH" defect.
      sireneJoin: { status: 'matched', naf: '63.11Z', denomination: 'O2SWITCH' },
    } as never);
    vi.mocked(lookupOperatorProfile).mockResolvedValue({
      status: 'found',
      profile: { naf: { value: '55.10Z' } },
    } as never);

    const result = await resolveCoverPrefill(
      fakeConnection,
      { candidateId: 'cand-1', name: 'HÔTEL EXEMPLE' } as never,
      {
        status: 'undetermined',
        basis: [],
        sirenSource: 'extracted',
        registrySnapshot: {
          denomination: 'REAL HOTEL COMPANY NAME',
          effectifBandLabel: null,
          retrievedAt: new Date(),
          source: 'sirene-api',
        },
      } as never,
      undefined,
      '552032534',
    );

    expect(result).toEqual({
      nomCommercial: 'Hôtel Exemple',
      raisonSociale: 'REAL HOTEL COMPANY NAME',
    });
  });

  it('rejects a non-hotel NAF on the registrySnapshot fallback too, for an unlinked audit, and prefills nothing', async () => {
    vi.mocked(lookupOperatorProfile).mockResolvedValue({
      status: 'found',
      profile: { naf: { value: '63.11Z' } },
    } as never);

    const result = await resolveCoverPrefill(
      fakeConnection,
      null,
      {
        status: 'undetermined',
        basis: [],
        sirenSource: 'extracted',
        registrySnapshot: {
          denomination: 'O2SWITCH',
          effectifBandLabel: null,
          retrievedAt: new Date(),
          source: 'sirene-api',
        },
      } as never,
      undefined,
      '732829320',
    );

    expect(result).toEqual({});
    expect(getHotelQualification).not.toHaveBeenCalled();
  });
});
