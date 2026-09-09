import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import type { Browser } from 'playwright';
import type { AuditConfigSnapshot } from '@odysseus/core';
import { launchBrowser } from './browser.js';
import type { CrawledPage, CrawlResult } from './crawl.js';
import {
  CRAWL_CHECKPOINT_FILENAME,
  buildScanToolIdentity,
  readCrawlCheckpoint,
  writeCrawlCheckpoint,
} from './artifacts/crawl-checkpoint-io.js';
import { buildPageDir } from './artifacts/paths.js';
import { readPageScanJson } from './artifacts/page-scan-io.js';
import {
  scanSite,
  type CrawlCheckpointResumeDecision,
  type ScanProgressEvent,
} from './scan-site.js';

// Origin of the shared fixtures/spa-demo dev server started once per e2e
// run by scripts/vitest-e2e-global-setup.mjs.
const TEST_URL = inject('spaDemoOrigin');

let browser: Browser;
let debugPort: number;
let auditDir: string;
let screenshotDir: string;

// Issue #132: crawlSite is wrapped, passing straight through to the real
// crawl, so the tests can assert a resumed run never invokes it again.
let crawlSiteInvocations = 0;
vi.mock('./crawl.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./crawl.js')>();
  return {
    ...actual,
    crawlSite: (...args: Parameters<typeof actual.crawlSite>) => {
      crawlSiteInvocations += 1;
      return actual.crawlSite(...args);
    },
  };
});

// Issue #132: the shared vite fixture exposes no request counter, so
// requests to it are counted through the scanner browser's own context
// events. This can prove a run performed zero page loads (the coverage
// gate rejection below), but it can never reach zero on a healthy resumed
// run: the site-level cookie consent check navigates the homepage once per
// audit in a fresh context regardless of resume, and the llms.txt and
// header probes ride Node fetch instead of the browser.
let fixtureRequestCount = 0;

const startedAt = new Date('2026-09-09T00:00:00.000Z');

const config: AuditConfigSnapshot = {
  maxPages: 10,
  maxDepth: 3,
  crawlDelayMs: 0,
  pageTimeoutMs: 30_000,
  lighthouseTimeoutMs: 60_000,
  renderSettleTimeoutMs: 8_000,
  userAgent: 'OdysseusAuditBot/e2e',
  scanConcurrency: 2,
  sitemapMode: 'supplement',
};

function scanOptions(
  overrides: { config?: AuditConfigSnapshot } = {},
): Parameters<typeof scanSite>[1] {
  return {
    browser,
    debugPort,
    maxPages: 10,
    maxDepth: 3,
    delayMs: 0,
    screenshotDir,
    auditDir,
    writePagesAsScanned: true,
    fullAuditPlanning: true,
    checkpointContext: { startedAt, config: overrides.config ?? config },
  };
}

describe('scanSite resumes a full audit from the crawl checkpoint (plan 035)', () => {
  beforeAll(async () => {
    ({ browser, debugPort } = await launchBrowser());
    browser.on('context', (context) => {
      context.on('request', (request) => {
        if (request.url().startsWith(TEST_URL)) fixtureRequestCount += 1;
      });
    });
    auditDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-resume-'));
    screenshotDir = path.join(auditDir, 'pages');
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    if (auditDir) await fs.promises.rm(auditDir, { recursive: true, force: true });
  });

  it('writes the crawl checkpoint on the first run', async () => {
    const decisions: CrawlCheckpointResumeDecision[] = [];
    const result = await scanSite(TEST_URL, {
      ...scanOptions(),
      onResumeDecision: (decision) => decisions.push(decision),
    });

    expect(decisions).toEqual([{ mode: 'fresh', reason: 'no-checkpoint' }]);
    expect(result.crawl.visitedCount).toBe(4);
    expect(fs.existsSync(path.join(auditDir, CRAWL_CHECKPOINT_FILENAME))).toBe(true);
    // The checkpointed inventory is exactly the crawl this run performed.
    expect(readCrawlCheckpoint(auditDir)?.crawl).toEqual(result.crawl);
  }, 300_000);

  it('replays the checkpointed crawl and skips every completed page on the second run', async () => {
    const crawlsBefore = crawlSiteInvocations;
    const decisions: CrawlCheckpointResumeDecision[] = [];
    const events: ScanProgressEvent[] = [];
    const result = await scanSite(TEST_URL, {
      ...scanOptions(),
      onResumeDecision: (decision) => decisions.push(decision),
      onProgress: (event) => events.push(event),
    });
    // The checkpoint was not rewritten by the resumed run (scanSite skips
    // the rewrite), so it still holds exactly the first run's inventory.
    const firstRun = readCrawlCheckpoint(auditDir)?.crawl;

    expect(decisions).toEqual([{ mode: 'resumed', reusedPages: 4 }]);

    // The crawl came from the file, not the network: byte-for-byte the
    // inventory the first run checkpointed.
    expect(firstRun).toBeDefined();
    expect(result.crawl).toEqual(firstRun);

    const visitedUrls = result.crawl.pages
      .filter((page) => page.status === 'visited')
      .map((page) => page.url);

    // Every page's scan.json is present exactly once: one directory per
    // visited URL, and a readable scan.json in each.
    const pageDirs = fs
      .readdirSync(screenshotDir)
      .filter((entry) => fs.statSync(path.join(screenshotDir, entry)).isDirectory())
      .sort();
    expect(pageDirs).toEqual(visitedUrls.map((url) => buildPageDir(url)).sort());
    for (const url of visitedUrls) {
      expect(readPageScanJson(screenshotDir, url)).toBeDefined();
    }

    // Analysis coverage exists for every visited URL.
    expect(result.analysisCoverageByUrl).toBeDefined();
    for (const url of visitedUrls) {
      expect(result.analysisCoverageByUrl?.get(url)).toBeDefined();
    }

    // No content, Lighthouse, or emit work was re-performed: progress
    // counters count only newly performed work, and nothing was new.
    expect(events.filter((event) => event.type === 'content-scan-page')).toEqual([]);
    expect(events.filter((event) => event.type === 'scan-page')).toEqual([]);
    expect(events.filter((event) => event.type === 'lighthouse-page')).toEqual([]);

    // Plan 002 (issue #132): a post-persist crash re-runs this exact path,
    // so the resumed run must serve the crawl phase entirely from the
    // checkpoint and never crawl again. (The run is not literally request
    // free: see the fixtureRequestCount note at the top of the file for
    // the by-design per-audit consent navigation.)
    expect(crawlSiteInvocations).toBe(crawlsBefore);

    // Deletion is the interface stage's job, not scanSite's.
    expect(fs.existsSync(path.join(auditDir, CRAWL_CHECKPOINT_FILENAME))).toBe(true);
  }, 120_000);

  it('starts fresh and restamps the checkpoint when the config changes', async () => {
    const decisions: CrawlCheckpointResumeDecision[] = [];
    const changedConfig: AuditConfigSnapshot = { ...config, crawlDelayMs: 500 };

    const result = await scanSite(TEST_URL, {
      ...scanOptions({ config: changedConfig }),
      onResumeDecision: (decision) => decisions.push(decision),
    });

    expect(decisions).toEqual([{ mode: 'fresh', reason: 'config-mismatch' }]);
    // A genuine fresh crawl happened, and the checkpoint on disk now
    // carries the new configuration.
    expect(result.crawl.visitedCount).toBe(4);
    expect(readCrawlCheckpoint(auditDir)?.config).toEqual(changedConfig);
  }, 300_000);

  // Plan 002 (issue #132): the resume path re-runs the coverage gate over
  // the checkpointed inventory, so a checkpoint can never launder a crawl
  // the gate would reject into a report. Everything else about this
  // checkpoint is acceptable to isReusableCheckpoint (same run identity,
  // config, and tool identity); only the gate stands between it and a
  // reused crawl.
  it('rejects a checkpointed crawl that fails the coverage gate instead of resuming it', async () => {
    const failingCrawl: CrawlResult = {
      startUrl: `${TEST_URL}/`,
      pages: [
        { url: `${TEST_URL}/`, depth: 0, status: 'visited', discoveryMethod: 'seed' },
        ...Array.from({ length: 9 }, (_, index): CrawledPage => {
          return {
            url: `${TEST_URL}/rejected-${index}`,
            depth: 1,
            status: 'http-error-status',
            httpStatus: 503,
            discoveryMethod: 'link',
          };
        }),
      ],
      visitedCount: 1,
      maxPages: 10,
      maxDepth: 3,
      robotsTxtFound: true,
      effectiveDelayMs: 0,
      robotsSitemapUrls: [],
      robotsDisallowMatches: [],
      aiCrawlerBlocks: [],
      linkDiscoveredUrls: [],
    };
    writeCrawlCheckpoint(auditDir, {
      checkpointVersion: 'v1',
      startedAt: startedAt.toISOString(),
      config,
      toolIdentity: buildScanToolIdentity(),
      crawl: failingCrawl,
    });
    const requestsBefore = fixtureRequestCount;
    const crawlsBefore = crawlSiteInvocations;
    const decisions: CrawlCheckpointResumeDecision[] = [];

    await expect(
      scanSite(TEST_URL, {
        ...scanOptions(),
        onResumeDecision: (decision) => decisions.push(decision),
      }),
    ).rejects.toThrow(/coverage is too incomplete/i);

    // A deliberate stop, not a crash: no resume decision was reported, the
    // fixture server received no request at all (the gate throws before
    // any site-level probe runs), and the checkpoint stays on disk (a
    // failed attempt's checkpoint is inert by design, keyed to this run's
    // own directory and identity).
    expect(decisions).toEqual([]);
    expect(fixtureRequestCount).toBe(requestsBefore);
    expect(crawlSiteInvocations).toBe(crawlsBefore);
    expect(fs.existsSync(path.join(auditDir, CRAWL_CHECKPOINT_FILENAME))).toBe(true);
  }, 120_000);
});
