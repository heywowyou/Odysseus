import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Browser } from 'playwright';
import { normalizeAudit } from '@odysseus/core';
import { launchBrowser } from './browser.js';
import { scanSite, type ScanProgressEvent } from './scan-site.js';
import { assessTemporalCoherence, type TemporalAnchorSet } from './temporal-anchors.js';

// Origin of the shared fixtures/spa-demo dev server started once per e2e
// run by scripts/vitest-e2e-global-setup.mjs.
const TEST_URL = inject('spaDemoOrigin');

let browser: Browser;
let debugPort: number;
let scratchScreenshotDir: string;

describe('scanSite against fixtures/spa-demo', () => {
  beforeAll(async () => {
    ({ browser, debugPort } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
  });

  afterEach(async () => {
    if (scratchScreenshotDir) await fs.rm(scratchScreenshotDir, { recursive: true, force: true });
  });

  it('crawls then scans every visited page, skipping the robots-disallowed one', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-'));
    const result = await scanSite(TEST_URL, {
      browser,
      debugPort,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      screenshotDir: scratchScreenshotDir,
    });

    expect(result.crawl.visitedCount).toBe(4);
    expect(result.pages).toHaveLength(4);

    for (const pageResult of result.pages) {
      expect(pageResult.renderDiffError).toBeUndefined();
      expect(pageResult.axeError).toBeUndefined();
      expect(pageResult.lighthouseError).toBeUndefined();
      expect(pageResult.renderDiff).toBeDefined();
      expect(pageResult.axe).toBeDefined();
      expect(pageResult.lighthouse).toBeDefined();
    }

    const scannedUrls = new Set(result.pages.map((p) => new URL(p.url).pathname));
    expect(scannedUrls.has('/private.html')).toBe(false);

    const sitemapOnlyCrawlPage = result.crawl.pages.find(
      (page) => new URL(page.url).pathname === '/sitemap-only.html',
    );
    expect(sitemapOnlyCrawlPage?.discoveryMethod).toBe('sitemap-only');
    expect(result.crawl.linkDiscoveredUrls).not.toContain(`${TEST_URL}/sitemap-only.html`);
    const sitemapOnlyScan = result.pages.find(
      (page) => new URL(page.url).pathname === '/sitemap-only.html',
    );
    expect(sitemapOnlyScan?.axe?.violations.some((violation) => violation.id === 'image-alt')).toBe(
      true,
    );

    const findings = normalizeAudit({
      auditId: 'sitemap-supplement-test',
      startedAt: new Date('2026-08-26T00:00:00.000Z'),
      pages: result.pages,
    });
    expect(findings.some((finding) => finding.ruleId === 'sitemap-orphan-page')).toBe(true);

    const home = result.pages.find((p) => new URL(p.url).pathname === '/');
    expect(home?.transactionalFlowEvidence?.some((e) => e.kind === 'checkout-form')).toBe(true);

    const mentionsLegalesPage = result.pages.find(
      (p) => new URL(p.url).pathname === '/mentions-legales.html',
    );
    expect(mentionsLegalesPage?.mentionsLegalesError).toBeUndefined();
    expect(mentionsLegalesPage?.mentionsLegales?.siren).toBe('732829320');

    // The outbound-only Booking.com link must not have been treated as a
    // first-party check-out flow on any other page.
    const about = result.pages.find((p) => new URL(p.url).pathname === '/about.html');
    expect(about?.mentionsLegales).toBeUndefined();
  }, 180_000);

  it('emits scan-start once and scan-page once per scanned page, alongside crawl events', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-'));
    const events: ScanProgressEvent[] = [];

    const result = await scanSite(TEST_URL, {
      browser,
      debugPort,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      screenshotDir: scratchScreenshotDir,
      onProgress: (event) => events.push(event),
    });

    expect(events.filter((event) => event.type === 'crawl-start')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'crawl-page')).toHaveLength(
      result.crawl.visitedCount,
    );

    const starts = events.filter((event) => event.type === 'scan-start');
    expect(starts).toHaveLength(1);
    expect(starts[0]).toMatchObject({ totalPages: result.pages.length });

    const pageEvents = events.filter((event) => event.type === 'scan-page');
    expect(pageEvents).toHaveLength(result.pages.length);
    expect(
      pageEvents.map((event) => (event.type === 'scan-page' ? event.scanned : undefined)),
    ).toEqual(result.pages.map((_, index) => index + 1));
  }, 180_000);

  it('stages the full-audit planner: every page gets axe, and Lighthouse results match exactly what the plan selected', async () => {
    // fixtures/spa-demo is deliberately small (CLAUDE.md's own testing
    // section: "the fixture is two pages and cannot exercise everything"),
    // and its four pages are each structurally distinct, so it cannot by
    // itself exhibit the family-exemption/representative-sampling
    // behavior (already exhaustively unit-tested against a large synthetic
    // fixture in full-audit-plan.test.ts). What this test proves instead
    // is the real integration: every crawled page gets a rendered pass
    // (axe present, no error) regardless of the plan, and the actual
    // Lighthouse results the staged pipeline produced are exactly the set
    // the plan decided to select - never more (a page Lighthouse-navigated
    // for no recorded reason) and never less (a selected page silently
    // missing its result).
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-'));
    const result = await scanSite(TEST_URL, {
      browser,
      debugPort,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      screenshotDir: scratchScreenshotDir,
      fullAuditPlanning: true,
    });

    expect(result.pages).toHaveLength(4);
    for (const pageResult of result.pages) {
      expect(pageResult.renderDiffError).toBeUndefined();
      expect(pageResult.axeError).toBeUndefined();
      expect(pageResult.axe).toBeDefined();
    }

    expect(result.fullAuditPlan).toBeDefined();
    expect(result.fullAuditPlan?.decisions).toHaveLength(4);

    const selectedUrls = new Set(
      result
        .fullAuditPlan!.decisions.filter((decision) =>
          decision.plannedPasses.includes('lighthouse'),
        )
        .map((decision) => decision.url),
    );
    for (const pageResult of result.pages) {
      const wasSelected = selectedUrls.has(pageResult.url);
      expect(pageResult.lighthouse !== undefined || pageResult.lighthouseError !== undefined).toBe(
        wasSelected,
      );
    }

    // Every page in this small, structurally heterogeneous fixture is
    // either the homepage or falls back to "unknown" role (no repeated
    // template), so every page is independently mandatory here - which is
    // itself a useful confirmation that a real site with no repeated
    // templates never silently loses coverage under the new planner.
    expect(selectedUrls.size).toBe(4);
  }, 180_000);

  it('never runs Lighthouse under fullAuditPlanning when skipLighthouse is also set', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-'));
    const result = await scanSite(TEST_URL, {
      browser,
      debugPort,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      screenshotDir: scratchScreenshotDir,
      fullAuditPlanning: true,
      skipLighthouse: true,
    });

    expect(result.pages).toHaveLength(4);
    for (const pageResult of result.pages) {
      expect(pageResult.axe).toBeDefined();
      expect(pageResult.lighthouse).toBeUndefined();
      expect(pageResult.lighthouseError).toBeUndefined();
    }
  }, 180_000);

  it('keeps an operator-seeded sitemap page out of link reachability findings', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-'));
    const seededUrl = `${TEST_URL}/sitemap-only.html`;
    const result = await scanSite(TEST_URL, {
      browser,
      debugPort,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      screenshotDir: scratchScreenshotDir,
      seeds: [seededUrl],
      sitemapMode: 'inspect',
      skipLighthouse: true,
    });

    expect(result.crawl.pages.find((page) => page.url === seededUrl)?.discoveryMethod).toBe('seed');
    expect(result.crawl.linkDiscoveredUrls).not.toContain(seededUrl);

    const findings = normalizeAudit({
      auditId: 'operator-seed-reachability-test',
      startedAt: new Date('2026-08-26T00:00:00.000Z'),
      pages: result.pages,
    });
    const orphan = findings.find((finding) => finding.ruleId === 'sitemap-orphan-page');
    expect(orphan?.description).toContain(seededUrl);
  }, 180_000);

  it('opens and closes a temporal-coherence window around a scoped full audit', async () => {
    scratchScreenshotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-scan-site-'));
    const auditDir = path.join(scratchScreenshotDir, 'audit');
    await fs.mkdir(auditDir, { recursive: true });
    const result = await scanSite(TEST_URL, {
      browser,
      debugPort,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      screenshotDir: path.join(auditDir, 'pages'),
      auditDir,
      writePagesAsScanned: true,
      fullAuditPlanning: true,
      scopeDigest: `sha256:${'e'.repeat(64)}`,
    });

    const anchors = JSON.parse(
      await fs.readFile(path.join(auditDir, 'evidence', 'temporal-anchors.json'), 'utf8'),
    ) as TemporalAnchorSet;
    expect(anchors.startProbes).toHaveLength(2);
    expect(anchors.endProbe?.pageUrl).toBe(result.crawl.startUrl);
    expect(Date.parse(anchors.endProbe!.capturedAt)).toBeGreaterThan(
      Date.parse(anchors.startProbes[1]!.capturedAt),
    );

    const pageAnchors = result.pages.map((page) => page.structuralAnchor!);
    expect(pageAnchors.every((anchor) => anchor !== undefined)).toBe(true);
    expect(
      assessTemporalCoherence({ startUrl: result.crawl.startUrl, anchors, pageAnchors }).status,
    ).toBe('coherent');
  }, 180_000);
});
