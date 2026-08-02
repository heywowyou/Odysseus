import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FINDINGS_SCHEMA_VERSION } from '@odysseus/core';
import type { AuditConfigSnapshot, AuditManifest, ManifestKind, ManifestPageEntry } from '@odysseus/core';
import { findWorkspaceRoot } from '../config.js';
import type { CrawlResult } from '../crawl.js';
import type { CollectedToolVersions } from './versions.js';

let cachedOdysseusVersion: string | undefined;

function readOdysseusVersion(): string {
  if (cachedOdysseusVersion !== undefined) return cachedOdysseusVersion;
  const pkgPath = path.join(findWorkspaceRoot(), 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  cachedOdysseusVersion = pkg.version;
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
    },
    pages: input.pages,
  };
}
