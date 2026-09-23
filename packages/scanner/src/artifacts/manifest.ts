import { execFileSync } from 'node:child_process';
import {
  deriveCoverageLimitations,
  FINDINGS_SCHEMA_VERSION,
  UNKNOWN_BUILD_ID,
  normalizeBuildId,
} from '@odysseus/core';
import type {
  AuditPushbackEvent,
  PrivacySecurityCoverage,
  TranslationCluster,
} from '@odysseus/core';
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
import type { SiteRoleContact } from '../role-contact.js';

let cachedGitBuildId: string | undefined;

/** Item 0.6: this used to read the monorepo root package.json's "version"
 *  field verbatim ("0.1.0") straight into a paying client's footer, which
 *  reads as "you are running my pre-release software". A git short SHA
 *  ties every report to an exact commit for our own debugging without
 *  exposing a semver number that never gets bumped.
 *
 *  Issue #58: deriving that SHA from a git checkout at runtime is exactly
 *  what production does not have. The deployment image excludes .git
 *  (.dockerignore), so every report rendered from the hosted dashboard
 *  resolved the "unknown" sentinel and printed it to the client, and every
 *  artifact produced there recorded no build at all. The commit is known at
 *  image build time, so it is stamped into ODYSSEUS_BUILD_ID there and read
 *  from the environment first. The git call remains the development path,
 *  where there is a checkout and no stamp.
 *
 *  The environment is deliberately not cached: it costs nothing to read,
 *  and caching it would make the resolver's precedence untestable without
 *  exposing a reset hook that only tests would ever call. */
export function readOdysseusBuildId(): string {
  const stamped = process.env.ODYSSEUS_BUILD_ID;
  if (stamped !== undefined && stamped.trim() !== '') return normalizeBuildId(stamped);
  if (cachedGitBuildId !== undefined) return cachedGitBuildId;
  try {
    cachedGitBuildId = normalizeBuildId(
      execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: findWorkspaceRoot(),
        encoding: 'utf-8',
      }),
    );
  } catch {
    cachedGitBuildId = UNKNOWN_BUILD_ID;
  }
  return cachedGitBuildId;
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
  siteSignals?: AuditManifestSiteSignals & { roleContact?: SiteRoleContact };
  cruxFieldData?: CruxFieldDataResult;
  privacySecurityCoverage?: PrivacySecurityCoverage;
  translationClusters?: TranslationCluster[];
  pushbackEvents?: AuditPushbackEvent[];
}

export function buildManifest(input: BuildManifestInput): AuditManifest {
  return {
    auditId: input.auditId,
    kind: input.kind,
    siteUrl: input.siteUrl,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    tool: {
      odysseusVersion: readOdysseusBuildId(),
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: input.tool.axeCoreVersion,
      lighthouseVersion: input.tool.lighthouseVersion,
      playwrightVersion: input.tool.playwrightVersion,
      chromiumVersion: input.tool.chromiumVersion,
    },
    config: input.config,
    crawl: {
      startUrl: input.crawl.startUrl,
      ...(input.crawl.homepageUrl !== undefined ? { homepageUrl: input.crawl.homepageUrl } : {}),
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
      ...(input.crawl.sitemapUrls !== undefined ? { sitemapUrls: input.crawl.sitemapUrls } : {}),
    },
    ...(input.pushbackEvents !== undefined ? { pushbackEvents: input.pushbackEvents } : {}),
    ...(() => {
      const limitations = deriveCoverageLimitations(input.pages, {
        ...(input.crawl.homepageUrl !== undefined ? { homepageUrl: input.crawl.homepageUrl } : {}),
        capOmittedPageCount: input.crawl.sitemapCoverage?.capOmittedPageCount ?? 0,
      });
      return limitations.length > 0 ? { coverageLimitations: limitations } : {};
    })(),
    pages: input.pages,
    ...(input.crawl.continuationGuardSummary !== undefined
      ? { continuationGuardSummary: input.crawl.continuationGuardSummary }
      : {}),
    ...(input.crawl.relativeLinkNestingSummary !== undefined
      ? { relativeLinkNestingSummary: input.crawl.relativeLinkNestingSummary }
      : {}),
    ...(input.siteSignals !== undefined ? { siteSignals: input.siteSignals } : {}),
    ...(input.cruxFieldData !== undefined ? { cruxFieldData: input.cruxFieldData } : {}),
    ...(input.privacySecurityCoverage !== undefined
      ? { privacySecurityCoverage: input.privacySecurityCoverage }
      : {}),
    ...(input.translationClusters !== undefined
      ? { translationClusters: input.translationClusters }
      : {}),
  };
}
