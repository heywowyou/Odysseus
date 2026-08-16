import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { normalizeAudit, type AuditManifest, type NormalizePageInput } from '@odysseus/core';

/**
 * Re-runs normalization offline, from stored scan.json files only. No
 * scanning, no network, no MongoDB: normalization rules will change
 * repeatedly across Milestones 4, 5, and 6, and without this, every
 * tuning pass would mean re-scanning a real client site (minutes, plus
 * another round of uninvited traffic) per iteration.
 */
async function readPageInputs(artifactsDir: string): Promise<NormalizePageInput[]> {
  const pagesDir = path.join(artifactsDir, 'pages');
  const entries = await fs.readdir(pagesDir, { withFileTypes: true });

  const pages: NormalizePageInput[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const scanJsonPath = path.join(pagesDir, entry.name, 'scan.json');
    try {
      const raw = await fs.readFile(scanJsonPath, 'utf-8');
      pages.push(JSON.parse(raw) as NormalizePageInput);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return pages;
}

export function registerNormalizeCommand(program: Command): void {
  program
    .command('normalize <artifacts-dir>')
    .description(
      'Re-run normalization offline against stored scan.json files in an audit directory. ' +
        'Overwrites findings.json. Never scans, never touches the network or MongoDB.',
    )
    .action(async (artifactsDir: string) => {
      const resolvedDir = path.resolve(artifactsDir);

      try {
        const manifestPath = path.join(resolvedDir, 'manifest.json');
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as AuditManifest;

        const pages = await readPageInputs(resolvedDir);

        const findings = normalizeAudit({
          auditId: manifest.auditId,
          startedAt: new Date(manifest.startedAt),
          pages,
          crawl: {
            startUrl: manifest.crawl.startUrl,
            pages: manifest.pages.map((page) => ({
              url: page.url,
              status: page.status,
              ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
              ...(page.discoveredFrom !== undefined ? { discoveredFrom: page.discoveredFrom } : {}),
            })),
            ...(manifest.crawl.robotsDisallowMatches !== undefined
              ? { robotsDisallowMatches: manifest.crawl.robotsDisallowMatches }
              : {}),
          },
        });

        await fs.writeFile(
          path.join(resolvedDir, 'findings.json'),
          JSON.stringify(findings, null, 2),
        );

        const renormalizedManifest: AuditManifest = {
          ...manifest,
          renormalizedAt: new Date().toISOString(),
        };
        await fs.writeFile(manifestPath, JSON.stringify(renormalizedManifest, null, 2));

        console.log(`Re-normalized ${manifest.auditId} from ${pages.length} page(s)`);
        console.log(`  Findings: ${findings.length}`);
        console.log(`  Updated: ${path.join(resolvedDir, 'findings.json')}`);
        console.log('  MongoDB was not touched; this command is local-only.');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`odysseus normalize: failed to normalize ${resolvedDir}\n${message}`);
        process.exitCode = 1;
      }
    });
}
