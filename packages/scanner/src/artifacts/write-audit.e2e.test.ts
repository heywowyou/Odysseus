import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Browser } from 'playwright';
import { normalizeAudit } from '@odysseus/core';
import { launchBrowser } from '../browser.js';
import { scanSite } from '../scan-site.js';
import { buildAuditDir, buildPageDir } from './paths.js';
import { couldEverBeKept } from './prune-screenshots.js';
import { writeAuditArtifacts } from './write-audit.js';
import { writeFindingsFile } from './write-findings.js';

// Origin of the shared fixtures/spa-demo dev server started once per e2e
// run by scripts/vitest-e2e-global-setup.mjs.
const TEST_URL = inject('spaDemoOrigin');

let browser: Browser;
let debugPort: number;
let scratchArtifactsRoot: string;

describe('writeAuditArtifacts against fixtures/spa-demo', () => {
  beforeAll(async () => {
    ({ browser, debugPort } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
  });

  afterEach(async () => {
    if (scratchArtifactsRoot) await fs.rm(scratchArtifactsRoot, { recursive: true, force: true });
  });

  it('writes manifest.json, per-page scan.json, and screenshots in the new layout', async () => {
    scratchArtifactsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-write-audit-'));

    const startedAt = new Date();
    const hostname = new URL(TEST_URL).hostname;
    const screenshotDir = path.join(
      buildAuditDir(scratchArtifactsRoot, hostname, startedAt),
      'pages',
    );

    const siteResult = await scanSite(TEST_URL, {
      browser,
      debugPort,
      maxPages: 10,
      maxDepth: 3,
      delayMs: 0,
      screenshotDir,
    });

    // scanSite doesn't accept an artifactsRoot override directly, only a
    // screenshotDir; writeAuditArtifacts independently derives auditDir
    // from getArtifactsRoot(), so point it at the same scratch root via
    // the env var it reads, to keep manifest.json/scan.json alongside
    // the screenshots scanSite already wrote.
    const originalArtifactsRoot = process.env.ODYSSEUS_ARTIFACTS_ROOT;
    process.env.ODYSSEUS_ARTIFACTS_ROOT = scratchArtifactsRoot;
    let result;
    try {
      result = await writeAuditArtifacts({
        kind: 'audit',
        siteResult,
        browser,
        startedAt,
        finishedAt: new Date(),
        config: {
          maxPages: 10,
          maxDepth: 3,
          crawlDelayMs: 0,
          pageTimeoutMs: 30000,
          lighthouseTimeoutMs: 60000,
          userAgent: 'OdysseusAuditBot/0.1 (test)',
          scanConcurrency: 3,
          sitemapMode: 'supplement',
        },
      });
    } finally {
      if (originalArtifactsRoot === undefined) delete process.env.ODYSSEUS_ARTIFACTS_ROOT;
      else process.env.ODYSSEUS_ARTIFACTS_ROOT = originalArtifactsRoot;
    }

    expect(existsSync(path.join(result.auditDir, 'manifest.json'))).toBe(true);
    expect(result.manifest.kind).toBe('audit');
    expect(result.manifest.pages.length).toBeGreaterThan(0);
    expect(result.manifest.crawl.sitemapCoverage).toMatchObject({
      declaredPageCount: 4,
      eligiblePageCount: 4,
      scannedPageCount: 4,
      capOmittedPageCount: 0,
    });
    expect(
      result.manifest.pages.find((page) => new URL(page.url).pathname === '/sitemap-only.html'),
    ).toMatchObject({ status: 'visited', discoveryMethod: 'sitemap-only' });

    expect(result.manifest.siteSignals?.siren).toBe('732829320');
    expect(result.manifest.siteSignals?.mentionsLegalesPageUrl).toBe(
      `${TEST_URL}/mentions-legales.html`,
    );
    expect(result.manifest.siteSignals?.hasTransactionalFlow).toBe(true);

    for (const pageResult of siteResult.pages) {
      const pageDir = buildPageDir(pageResult.url);
      const pageDirPath = path.join(result.auditDir, 'pages', pageDir);
      expect(existsSync(path.join(pageDirPath, 'scan.json'))).toBe(true);

      // Capture is gated on couldEverBeKept (both screenshots or neither):
      // a page the pruner would rank out carries no pair at all, and the
      // homepage here is the visited seed URL, matching scanSite.
      const captured = couldEverBeKept({
        missingPercent: pageResult.renderDiff?.missingPercent,
        isHomepage: pageResult.url === TEST_URL,
      });
      expect(existsSync(path.join(pageDirPath, 'raw.png'))).toBe(captured);
      expect(existsSync(path.join(pageDirPath, 'rendered.png'))).toBe(captured);

      const scanJson = JSON.parse(
        await fs.readFile(path.join(pageDirPath, 'scan.json'), 'utf-8'),
      ) as { renderDiff?: { rawScreenshotRef?: string } };
      // Screenshot refs in scan.json are relative, not absolute.
      expect(path.isAbsolute(scanJson.renderDiff?.rawScreenshotRef ?? '/')).toBe(false);
    }

    // The returned pages[] are directly usable by core's normalizeAudit,
    // confirming the artifact-writing and normalization layers agree on
    // shape without any adapter code.
    const findings = normalizeAudit({
      auditId: result.auditId,
      startedAt,
      pages: result.pages,
    });
    await writeFindingsFile(result.auditDir, findings);
    expect(existsSync(path.join(result.auditDir, 'findings.json'))).toBe(true);
    expect(findings.some((finding) => finding.ruleId === 'sitemap-orphan-page')).toBe(true);
  }, 180_000);
});
