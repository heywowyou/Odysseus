import path from 'node:path';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import {
  buildAuditDir,
  getArtifactsRoot,
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getLighthouseTimeoutMs,
  getMaxCrawlDepth,
  getMaxPages,
  getPageTimeoutMs,
  launchBrowser,
  pruneScreenshots,
  scanSite,
  writeAuditArtifacts,
  writeFindingsFile,
  type PrunePageInfo,
} from '@odysseus/scanner';
import { normalizeAudit, type AuditConfigSnapshot, type AuditManifest } from '@odysseus/core';
import { connectToMongo, disconnectFromMongo, persistAudit } from '@odysseus/store';

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`must be a positive integer, got "${value}"`);
  }
  return parsed;
}

/** Derives pruneScreenshots' page list from the manifest it already
 *  produced, rather than re-deriving it from raw scan results, so the
 *  manifest stays the single source of truth for what was scanned. */
function prunePageInfoFromManifest(manifest: AuditManifest): PrunePageInfo[] {
  return manifest.pages
    .filter((page): page is typeof page & { pageDir: string } => page.pageDir !== undefined)
    .map((page) => ({
      pageUrl: page.url,
      pageDir: page.pageDir,
      missingPercent: page.renderDiffMissingPercent,
      isHomepage: page.url === manifest.crawl.startUrl,
    }));
}

export function registerAuditCommand(program: Command): void {
  program
    .command('audit <url>')
    .description(
      'Crawl a site, run all scanners, normalize into findings, and persist to MongoDB. ' +
        'Prints a summary and the auditId.',
    )
    .option('--max-pages <n>', 'Maximum number of pages to visit', parsePositiveInt)
    .option('--max-depth <n>', 'Maximum link depth from the homepage', parsePositiveInt)
    .action(async (url: string, opts: { maxPages?: number; maxDepth?: number }) => {
      try {
        new URL(url);
      } catch {
        console.error(`odysseus audit: "${url}" is not a valid URL`);
        process.exitCode = 1;
        return;
      }

      const startedAt = new Date();
      const { browser, debugPort } = await launchBrowser();
      let mongoConnection: Awaited<ReturnType<typeof connectToMongo>> | undefined;

      try {
        const hostname = new URL(url).hostname;
        const screenshotDir = path.join(
          buildAuditDir(getArtifactsRoot(), hostname, startedAt),
          'pages',
        );

        const siteResult = await scanSite(url, {
          browser,
          debugPort,
          screenshotDir,
          ...(opts.maxPages !== undefined ? { maxPages: opts.maxPages } : {}),
          ...(opts.maxDepth !== undefined ? { maxDepth: opts.maxDepth } : {}),
        });

        const finishedAt = new Date();

        const config: AuditConfigSnapshot = {
          maxPages: opts.maxPages ?? getMaxPages(),
          maxDepth: opts.maxDepth ?? getMaxCrawlDepth(),
          crawlDelayMs: getCrawlDelayMs(),
          pageTimeoutMs: getPageTimeoutMs(),
          lighthouseTimeoutMs: getLighthouseTimeoutMs(),
          userAgent: getCrawlerUserAgent(),
        };

        const artifacts = await writeAuditArtifacts({
          kind: 'audit',
          siteResult,
          browser,
          startedAt,
          finishedAt,
          config,
        });

        const findings = normalizeAudit({
          auditId: artifacts.auditId,
          startedAt,
          pages: artifacts.pages,
        });
        await writeFindingsFile(artifacts.auditDir, findings);

        const { prunedPageDirs } = await pruneScreenshots(
          artifacts.auditDir,
          prunePageInfoFromManifest(artifacts.manifest),
        );

        mongoConnection = await connectToMongo();
        await persistAudit(mongoConnection, artifacts.manifest, findings);

        const bySeverity = { critical: 0, serious: 0, moderate: 0, minor: 0 };
        for (const finding of findings) bySeverity[finding.severity]++;

        console.log(`Audit ${artifacts.auditId} complete for ${url}`);
        console.log(`  Pages visited: ${siteResult.crawl.visitedCount}`);
        console.log(
          `  Findings: ${findings.length} (critical: ${bySeverity.critical}, serious: ${bySeverity.serious}, moderate: ${bySeverity.moderate}, minor: ${bySeverity.minor})`,
        );
        console.log(`  Screenshots pruned: ${prunedPageDirs.length}`);
        console.log(`  Artifacts: ${artifacts.auditDir}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus audit: failed to audit ${url}\n${message}`);
        process.exitCode = 1;
      } finally {
        if (mongoConnection) await disconnectFromMongo(mongoConnection);
        await browser.close();
      }
    });
}
