import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import {
  buildTranslationClusters,
  buildFindingsProvenance,
  normalizeAudit,
  type AuditManifest,
  type NormalizePageInput,
  type TranslationCluster,
} from '@odysseus/core';
import { buildArtifactBucketKey, parseAuditTimestampDir } from '@odysseus/scanner';
import { createConfiguredArtifactStore, resolveArtifactFile } from '@odysseus/interface';

/**
 * Re-runs normalization offline, from stored scan.json files only. No
 * scanning, no network, no MongoDB: normalization rules will change
 * repeatedly across Milestones 4, 5, and 6, and without this, every
 * tuning pass would mean re-scanning a real client site (minutes, plus
 * another round of uninvited traffic) per iteration.
 */
/** Issue #63: the bucket key needs hostname and startedAt, which
 *  buildAuditDir encodes into a real audit directory's own
 *  `<hostname>/<timestamp>` layout - read from the path rather than from
 *  manifest.json, since that read is exactly the one that might need the
 *  bucket fallback below. Returns undefined for a directory that isn't in
 *  that shape (a de-identified test fixture, a renamed local copy),
 *  matching this command's original directory-name-agnostic behaviour:
 *  no identity means no bucket key, so every read below falls back to a
 *  plain local read exactly as it always has. */
function tryReadAuditDirIdentity(
  resolvedDir: string,
): { hostname: string; startedAt: Date } | undefined {
  try {
    return {
      hostname: path.basename(path.dirname(resolvedDir)),
      startedAt: parseAuditTimestampDir(path.basename(resolvedDir)),
    };
  } catch {
    return undefined;
  }
}

/** Reads one artifact file, going through the bucket fallback only when
 *  `identity` is known - see tryReadAuditDirIdentity. */
async function readArtifact(
  localPath: string,
  relativePath: string,
  identity: { hostname: string; startedAt: Date } | undefined,
): Promise<Buffer> {
  if (!identity) return fs.readFile(localPath);
  return resolveArtifactFile(
    localPath,
    buildArtifactBucketKey(identity.hostname, identity.startedAt, relativePath),
    createConfiguredArtifactStore(),
  );
}

async function readPageInputs(
  artifactsDir: string,
  identity: { hostname: string; startedAt: Date } | undefined,
): Promise<NormalizePageInput[]> {
  const pagesDir = path.join(artifactsDir, 'pages');
  const entries = await fs.readdir(pagesDir, { withFileTypes: true });

  const pages: NormalizePageInput[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativePath = path.join('pages', entry.name, 'scan.json');
    try {
      const raw = await readArtifact(path.join(artifactsDir, relativePath), relativePath, identity);
      pages.push(JSON.parse(raw.toString('utf-8')) as NormalizePageInput);
    } catch (error) {
      // A page directory with no scan.json (neither locally nor, if a
      // bucket is configured, in it) is skipped exactly as before this
      // issue - resolveArtifactFile's own "not found" error is the bucket-
      // aware equivalent of the plain ENOENT this loop always tolerated.
      const isEnoent = (error as NodeJS.ErrnoException).code === 'ENOENT';
      const isBucketMiss =
        error instanceof Error && /artifact not found locally/u.test(error.message);
      if (!isEnoent && !isBucketMiss) throw error;
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
        const identity = tryReadAuditDirIdentity(resolvedDir);
        const manifestPath = path.join(resolvedDir, 'manifest.json');
        const manifestBytes = await readArtifact(manifestPath, 'manifest.json', identity);
        const manifest = JSON.parse(manifestBytes.toString('utf-8')) as AuditManifest;

        const pages = await readPageInputs(resolvedDir, identity);

        // B2 (2026-08-24): collapses language-variant duplicates. Manifests
        // written before the field existed carry no clusters, so they are
        // rebuilt here from the same stored head metadata writeAuditArtifacts
        // itself reads - the whole point of this command is that a stored
        // audit gets today's normalization rules without being re-scanned,
        // and a clustering rule that only ever applied to fresh scans would
        // have broken that promise. Recomputed clusters are written back to
        // the manifest below, because the report layer reads them from there
        // rather than from findings.json.
        const translationClusters: TranslationCluster[] =
          manifest.translationClusters ??
          buildTranslationClusters(
            pages.map((page) => ({
              pageUrl: page.url,
              hreflangLinks: page.headMetadata?.hreflangLinks ?? [],
            })),
          );

        const findings = normalizeAudit({
          translationClusters,
          auditId: manifest.auditId,
          startedAt: new Date(manifest.startedAt),
          pages,
          crawl: {
            startUrl: manifest.crawl.startUrl,
            pages: manifest.pages.map((page) => ({
              url: page.url,
              status: page.status,
              ...(page.depth !== undefined ? { depth: page.depth } : {}),
              ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
              ...(page.discoveredFrom !== undefined ? { discoveredFrom: page.discoveredFrom } : {}),
            })),
            ...(manifest.crawl.robotsDisallowMatches !== undefined
              ? { robotsDisallowMatches: manifest.crawl.robotsDisallowMatches }
              : {}),
            ...(manifest.crawl.aiCrawlerBlocks !== undefined
              ? { aiCrawlerBlocks: manifest.crawl.aiCrawlerBlocks }
              : {}),
          },
          ...(manifest.cruxFieldData !== undefined
            ? { cruxFieldData: manifest.cruxFieldData }
            : {}),
        });

        await fs.writeFile(
          path.join(resolvedDir, 'findings.json'),
          JSON.stringify(findings, null, 2),
        );

        const renormalizedManifest: AuditManifest = {
          ...manifest,
          translationClusters,
          renormalizedAt: new Date().toISOString(),
          findingsProvenance: buildFindingsProvenance(findings),
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
