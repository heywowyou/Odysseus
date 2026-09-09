import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Browser } from 'playwright';
import type { AuditConfigSnapshot } from '@odysseus/core';
import { launchBrowser } from './browser.js';
import { crawlSite, type CrawlFrontierSnapshot, type CrawlResult } from './crawl.js';
import {
  CRAWL_STATE_FILENAME,
  readCrawlFrontierState,
  writeCrawlFrontierState,
} from './artifacts/crawl-frontier-io.js';
import {
  CRAWL_CHECKPOINT_FILENAME,
  buildScanToolIdentity,
} from './artifacts/crawl-checkpoint-io.js';
import { scanSite, type CrawlCheckpointResumeDecision } from './scan-site.js';

// Origin of the shared fixtures/spa-demo dev server started once per e2e
// run by scripts/vitest-e2e-global-setup.mjs.
const TEST_URL = inject('spaDemoOrigin');

let browser: Browser;
let debugPort: number;
// One directory for the crawlSite-level round trip, one for the
// scanSite-level wiring (which must start with no checkpoint file).
let frontierDir: string;
let scanAuditDir: string;
let scanScreenshotDir: string;
let cappedCrawl: CrawlResult;

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

/** Builds a real frontier file through the production write path: the
 *  crawl's own writeState callback completes the envelope crawl.ts owns,
 *  exactly as scanSite does. Never hand-written JSON. */
function frontierWriter(auditDir: string): (state: CrawlFrontierSnapshot) => void {
  return (state) => {
    writeCrawlFrontierState(auditDir, {
      format: 'full-audit-crawl-frontier-v1',
      startedAt: startedAt.toISOString(),
      config,
      toolIdentity: buildScanToolIdentity(),
      state,
    });
  };
}

describe('crawl frontier resume (plan 035 step 4)', () => {
  beforeAll(async () => {
    ({ browser, debugPort } = await launchBrowser());
    frontierDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'odysseus-crawl-frontier-'));
    scanAuditDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-frontier-'));
    scanScreenshotDir = path.join(scanAuditDir, 'pages');
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    if (frontierDir) await fs.promises.rm(frontierDir, { recursive: true, force: true });
    if (scanAuditDir) await fs.promises.rm(scanAuditDir, { recursive: true, force: true });
  });

  it('writes a frontier file via the cadence when a capped crawl stops mid-site', async () => {
    cappedCrawl = await crawlSite(TEST_URL, {
      browser,
      maxPages: 2,
      maxDepth: 3,
      delayMs: 0,
      sitemapMode: 'supplement',
      frontier: { writeState: frontierWriter(frontierDir), everyPages: 1, minIntervalMs: 0 },
    });

    expect(cappedCrawl.visitedCount).toBe(2);
    const onDisk = readCrawlFrontierState(frontierDir);
    expect(onDisk).toBeDefined();
    expect(onDisk?.format).toBe('full-audit-crawl-frontier-v1');
    expect(onDisk?.state.visited).toHaveLength(2);
    // The crawl stopped at the cap with its queue still non-empty and the
    // supplemental phase not yet entered: exactly the state a crash
    // mid-crawl would leave.
    expect(onDisk?.state.queue.length).toBeGreaterThan(0);
    expect(onDisk?.state.supplementalPhaseStarted).toBe(false);
  }, 120_000);

  it('resumes the queue without re-visiting and matches an uninterrupted control crawl', async () => {
    const onDisk = readCrawlFrontierState(frontierDir);
    if (onDisk === undefined) throw new Error('the capped crawl left no readable frontier file');

    const resumed = await crawlSite(TEST_URL, {
      browser,
      maxDepth: 3,
      delayMs: 0,
      sitemapMode: 'supplement',
      frontier: { resumeState: onDisk.state, writeState: frontierWriter(frontierDir) },
    });

    // No URL was re-visited: the resumed inventory holds exactly one
    // record per URL (a re-navigated URL would push a second record),
    // and every record the capped crawl already had is carried over
    // intact as part of the complete restored inventory.
    const resumedUrls = resumed.pages.map((page) => page.url);
    expect(new Set(resumedUrls).size).toBe(resumedUrls.length);
    for (const page of cappedCrawl.pages) {
      expect(resumedUrls).toContain(page.url);
    }

    const control = await crawlSite(TEST_URL, {
      browser,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      sitemapMode: 'supplement',
    });
    const visitedOf = (result: CrawlResult): string[] =>
      result.pages
        .filter((page) => page.status === 'visited')
        .map((page) => page.url)
        .sort();
    expect(visitedOf(resumed)).toEqual(visitedOf(control));
    expect(resumed.visitedCount).toBe(control.visitedCount);
    expect(resumedUrls).toHaveLength(control.pages.length);
    // The restored sitemap facts carried through: no re-fetch, same
    // coverage summary.
    expect(resumed.sitemapCoverage).toEqual(control.sitemapCoverage);
    expect(resumed.robotsTxtFound).toBe(true);
  }, 180_000);

  it('scanSite resumes from a valid frontier file, reports frontierResumed, and supersedes it with the checkpoint', async () => {
    // Fabricate the mid-crawl state by running the capped crawlSite
    // directly inside this audit directory; crawlSite never writes a
    // checkpoint, so scanSite must fall through to the frontier.
    await crawlSite(TEST_URL, {
      browser,
      maxPages: 2,
      maxDepth: 3,
      delayMs: 0,
      sitemapMode: 'supplement',
      frontier: { writeState: frontierWriter(scanAuditDir), everyPages: 1, minIntervalMs: 0 },
    });
    expect(fs.existsSync(path.join(scanAuditDir, CRAWL_STATE_FILENAME))).toBe(true);
    expect(fs.existsSync(path.join(scanAuditDir, CRAWL_CHECKPOINT_FILENAME))).toBe(false);

    const decisions: CrawlCheckpointResumeDecision[] = [];
    const result = await scanSite(TEST_URL, {
      browser,
      debugPort,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      screenshotDir: scanScreenshotDir,
      auditDir: scanAuditDir,
      writePagesAsScanned: true,
      fullAuditPlanning: true,
      checkpointContext: { startedAt, config },
      onResumeDecision: (decision) => decisions.push(decision),
    });

    expect(decisions).toEqual([{ mode: 'resumed', reusedPages: 0, frontierResumed: true }]);
    // The crawl completed the site: the two already-visited pages were
    // restored and the remaining queue plus supplemental phase ran.
    expect(result.crawl.visitedCount).toBe(4);
    // The checkpoint written after the gate supersedes the frontier file.
    expect(fs.existsSync(path.join(scanAuditDir, CRAWL_CHECKPOINT_FILENAME))).toBe(true);
    expect(fs.existsSync(path.join(scanAuditDir, CRAWL_STATE_FILENAME))).toBe(false);
  }, 300_000);
});
