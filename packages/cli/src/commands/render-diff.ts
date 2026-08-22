import path from 'node:path';
import type { Command } from 'commander';
import {
  buildAuditDir,
  getArtifactsRoot,
  getCrawlerUserAgent,
  getLighthouseTimeoutMs,
  getPageTimeoutMs,
  launchBrowser,
  renderDiff,
  writeAuditArtifacts,
} from '@odysseus/scanner';
import type { CrawlResult } from '@odysseus/scanner';

/**
 * Standalone one-page diagnostic. Uses the same on-disk layout as `audit`
 * (manifest.json plus pages/<slug>-<hash>/scan.json and screenshots), with
 * the manifest's kind set to 'render-diff', but deliberately writes no
 * findings.json and never touches MongoDB: it stays the lightweight,
 * disk-only diagnostic it has always been.
 */
export function registerRenderDiffCommand(program: Command): void {
  program
    .command('render-diff <url>')
    .description(
      'Fetch a URL raw and fully rendered, and report how much visible text a non-JavaScript crawler would miss.',
    )
    .action(async (url: string) => {
      try {
        new URL(url);
      } catch {
        console.error(`odysseus render-diff: "${url}" is not a valid URL`);
        process.exitCode = 1;
        return;
      }

      const startedAt = new Date();
      const { browser } = await launchBrowser();
      try {
        const hostname = new URL(url).hostname;
        const auditDir = buildAuditDir(getArtifactsRoot(), hostname, startedAt);
        const screenshotDir = path.join(auditDir, 'pages');

        const result = await renderDiff(browser, url, { screenshotDir });

        const crawl: CrawlResult = {
          startUrl: url,
          pages: [{ url, depth: 0, status: 'visited' }],
          visitedCount: 1,
          maxPages: 1,
          maxDepth: 0,
          robotsTxtFound: false,
          effectiveDelayMs: 0,
          robotsSitemapUrls: [],
          robotsDisallowMatches: [],
          aiCrawlerBlocks: [],
        };

        const artifacts = await writeAuditArtifacts({
          kind: 'render-diff',
          siteResult: { crawl, pages: [{ url, renderDiff: result }] },
          browser,
          startedAt,
          finishedAt: new Date(),
          config: {
            maxPages: 1,
            maxDepth: 0,
            crawlDelayMs: 0,
            pageTimeoutMs: getPageTimeoutMs(),
            lighthouseTimeoutMs: getLighthouseTimeoutMs(),
            userAgent: getCrawlerUserAgent(),
            scanConcurrency: 1,
          },
        });

        // Printed after writeAuditArtifacts, using its relativized output,
        // so stdout reflects the same portable, directory-relative
        // screenshot refs that were actually written to scan.json (a
        // disclosed behavior change from the previous absolute paths).
        console.log(JSON.stringify(artifacts.pages[0]?.renderDiff ?? result, null, 2));
        console.error(`odysseus render-diff: artifacts written to ${artifacts.auditDir}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus render-diff: failed to audit ${url}\n${message}`);
        process.exitCode = 1;
      } finally {
        await browser.close();
      }
    });
}
