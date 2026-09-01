import { FINDINGS_SCHEMA_VERSION, type Finding } from '../types/findings.js';
import type { AuditManifest, ManifestPageEntry } from '../types/manifest.js';
import type { FindingsProvenance } from '../normalize/findings-provenance.js';

/**
 * Minimal deterministic builders for the report-preparation tests. These
 * are stand-ins, not real-scan fixtures: the preparation policy is pure
 * over the manifest and findings shapes.
 */

let nextFindingId = 0;

export function buildFinding(
  overrides: Partial<Finding> & Pick<Finding, 'source' | 'category' | 'severity'>,
): Finding {
  nextFindingId += 1;
  return {
    findingId: `finding-${nextFindingId}`,
    auditId: 'audit-1',
    schemaVersion: FINDINGS_SCHEMA_VERSION,
    ruleId: 'rule-example',
    wcagCriteria: [],
    title: 'Example finding',
    description: 'Example description',
    pageUrls: ['https://site.example/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: `dedupe-${nextFindingId}`,
    firstSeenAt: new Date('2026-09-01T00:00:00Z'),
    lastSeenAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

export function buildPage(
  url: string,
  overrides: Partial<ManifestPageEntry> = {},
): ManifestPageEntry {
  return {
    url,
    depth: 0,
    status: 'visited',
    renderDiffMissingPercent: 0,
    errors: {},
    ...overrides,
  };
}

const tool = {
  odysseusVersion: 'test',
  findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
  axeCoreVersion: '4.0.0',
  lighthouseVersion: '12.0.0',
  playwrightVersion: '1.0.0',
  chromiumVersion: '140',
};

const config = {
  maxPages: 20,
  maxDepth: 3,
  crawlDelayMs: 1000,
  pageTimeoutMs: 15000,
  lighthouseTimeoutMs: 60000,
  userAgent: 'odysseus-test',
  scanConcurrency: 2,
};

export function buildManifest(
  pages: ManifestPageEntry[],
  overrides: Partial<AuditManifest> = {},
): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://site.example/',
    startedAt: '2026-09-01T00:00:00Z',
    finishedAt: '2026-09-01T00:01:00Z',
    tool,
    config,
    crawl: {
      startUrl: 'https://site.example/',
      visitedCount: pages.filter((page) => page.status === 'visited').length,
      maxPages: 20,
      maxDepth: 3,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages,
    ...overrides,
  };
}

export function buildProvenance(digest: string): FindingsProvenance {
  return {
    findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
    normalizationFingerprint: 'fp-test',
    findingsDigest: digest,
  };
}
