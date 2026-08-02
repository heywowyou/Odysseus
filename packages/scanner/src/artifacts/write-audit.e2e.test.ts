import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { normalizeAudit } from '@odysseus/core';
import { launchBrowser } from '../browser.js';
import { scanSite } from '../scan-site.js';
import { buildAuditDir, buildPageDir } from './paths.js';
import { writeAuditArtifacts } from './write-audit.js';
import { writeFindingsFile } from './write-findings.js';

const TEST_PORT = 5199;
const TEST_URL = `http://localhost:${TEST_PORT}`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const spaDemoDir = path.resolve(__dirname, '../../../../fixtures/spa-demo');
const viteBin = path.join(spaDemoDir, 'node_modules', '.bin', 'vite');

let devServer: ChildProcess;
let browser: Browser;
let debugPort: number;
let scratchArtifactsRoot: string;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url} to respond`);
}

describe('writeAuditArtifacts against fixtures/spa-demo', () => {
  beforeAll(async () => {
    devServer = spawn(viteBin, ['--port', String(TEST_PORT), '--strictPort'], {
      cwd: spaDemoDir,
      stdio: 'ignore',
    });
    await waitForServer(TEST_URL, 30_000);
    ({ browser, debugPort } = await launchBrowser());
  }, 45_000);

  afterAll(async () => {
    await browser?.close();
    devServer?.kill();
  });

  afterEach(async () => {
    if (scratchArtifactsRoot) await fs.rm(scratchArtifactsRoot, { recursive: true, force: true });
  });

  it(
    'writes manifest.json, per-page scan.json, and screenshots in the new layout',
    async () => {
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
          },
        });
      } finally {
        if (originalArtifactsRoot === undefined) delete process.env.ODYSSEUS_ARTIFACTS_ROOT;
        else process.env.ODYSSEUS_ARTIFACTS_ROOT = originalArtifactsRoot;
      }

      expect(existsSync(path.join(result.auditDir, 'manifest.json'))).toBe(true);
      expect(result.manifest.kind).toBe('audit');
      expect(result.manifest.pages.length).toBeGreaterThan(0);

      for (const pageResult of siteResult.pages) {
        const pageDir = buildPageDir(pageResult.url);
        const pageDirPath = path.join(result.auditDir, 'pages', pageDir);
        expect(existsSync(path.join(pageDirPath, 'scan.json'))).toBe(true);
        expect(existsSync(path.join(pageDirPath, 'raw.png'))).toBe(true);
        expect(existsSync(path.join(pageDirPath, 'rendered.png'))).toBe(true);

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
    },
    180_000,
  );
});
