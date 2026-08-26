import { execFileSync } from 'node:child_process';
import { FINDINGS_SCHEMA_VERSION } from '@odysseus/core';
import type { TranslationCluster } from '@odysseus/core';
import type {
  AuditConfigSnapshot,
  AuditManifest,
  AuditManifestSiteSignals,
  CruxFieldDataResult,
  ManifestKind,
  ManifestPageEntry,
} from '@odysseus/core';
import { findWorkspaceRoot } from '../config.js';
import type { CrawlResult } from '../crawl.js';
import type { CollectedToolVersions } from './versions.js';

let cachedOdysseusVersion: string | undefined;

/** Item 0.6: this used to read the monorepo root package.json's "version"
 *  field verbatim ("0.1.0") straight into a paying client's footer, which
 *  reads as "you are running my pre-release software". A git short SHA
 *  ties every report to an exact commit for our own debugging without
 *  exposing a semver number that never gets bumped. Falls back to
 *  "unknown" outside a git checkout (e.g. a stripped deployment archive)
 *  rather than throwing. */
function readOdysseusVersion(): string {
  if (cachedOdysseusVersion !== undefined) return cachedOdysseusVersion;
  try {
    cachedOdysseusVersion = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: findWorkspaceRoot(),
      encoding: 'utf-8',
    }).trim();
  } catch {
    cachedOdysseusVersion = 'unknown';
  }
  return cachedOdysseusVersion;
}

export interface BuildManifestInput {
  auditId: string;
  kind: ManifestKind;
  siteUrl: string;
  startedAt: Date;
  finishedAt: Date;
  tool: CollectedToolVersions;
  config: AuditConfigSnapshot;
  crawl: CrawlResult;
  pages: ManifestPageEntry[];
  siteSignals?: AuditManifestSiteSignals;
  cruxFieldData?: CruxFieldDataResult;
  translationClusters?: TranslationCluster[];
}

export function buildManifest(input: BuildManifestInput): AuditManifest {
  return {
    auditId: input.auditId,
    kind: input.kind,
    siteUrl: input.siteUrl,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    tool: {
      odysseusVersion: readOdysseusVersion(),
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: input.tool.axeCoreVersion,
      lighthouseVersion: input.tool.lighthouseVersion,
      playwrightVersion: input.tool.playwrightVersion,
      chromiumVersion: input.tool.chromiumVersion,
    },
    config: input.config,
    crawl: {
      startUrl: input.crawl.startUrl,
      visitedCount: input.crawl.visitedCount,
      maxPages: input.crawl.maxPages,
      maxDepth: input.crawl.maxDepth,
      robotsTxtFound: input.crawl.robotsTxtFound,
      effectiveDelayMs: input.crawl.effectiveDelayMs,
      robotsDisallowMatches: input.crawl.robotsDisallowMatches,
      aiCrawlerBlocks: input.crawl.aiCrawlerBlocks,
      ...(input.crawl.sitemapCoverage !== undefined
        ? { sitemapCoverage: input.crawl.sitemapCoverage }
        : {}),
    },
    pages: input.pages,
    ...(input.siteSignals !== undefined ? { siteSignals: input.siteSignals } : {}),
    ...(input.cruxFieldData !== undefined ? { cruxFieldData: input.cruxFieldData } : {}),
    ...(input.translationClusters !== undefined
      ? { translationClusters: input.translationClusters }
      : {}),
  };
}
