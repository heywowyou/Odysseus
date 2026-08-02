import { describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION } from '@odysseus/core';
import { buildManifest } from './manifest.js';
import type { CrawlResult } from '../crawl.js';

function buildCrawlResult(overrides: Partial<CrawlResult> = {}): CrawlResult {
  return {
    startUrl: 'https://example.com/',
    pages: [],
    visitedCount: 1,
    maxPages: 20,
    maxDepth: 5,
    robotsTxtFound: true,
    effectiveDelayMs: 1000,
    ...overrides,
  };
}

describe('buildManifest', () => {
  it('serializes startedAt/finishedAt as ISO 8601 strings', () => {
    const manifest = buildManifest({
      auditId: 'audit-1',
      kind: 'audit',
      siteUrl: 'https://example.com/',
      startedAt: new Date('2026-08-02T14:32:05.000Z'),
      finishedAt: new Date('2026-08-02T14:35:00.000Z'),
      tool: {
        playwrightVersion: '1.49.0',
        chromiumVersion: '130.0.0.0',
        axeCoreVersion: '4.12.1',
        lighthouseVersion: '12.8.2',
      },
      config: {
        maxPages: 20,
        maxDepth: 5,
        crawlDelayMs: 1000,
        pageTimeoutMs: 30000,
        lighthouseTimeoutMs: 60000,
        userAgent: 'OdysseusAuditBot/0.1',
      },
      crawl: buildCrawlResult(),
      pages: [],
    });

    expect(manifest.startedAt).toBe('2026-08-02T14:32:05.000Z');
    expect(manifest.finishedAt).toBe('2026-08-02T14:35:00.000Z');
    expect(manifest.tool.findingsSchemaVersion).toBe(FINDINGS_SCHEMA_VERSION);
    expect(manifest.tool.axeCoreVersion).toBe('4.12.1');
    expect(typeof manifest.tool.odysseusVersion).toBe('string');
    expect(manifest.kind).toBe('audit');
  });

  it('carries null tool versions through when a scanner never succeeded', () => {
    const manifest = buildManifest({
      auditId: 'audit-1',
      kind: 'render-diff',
      siteUrl: 'https://example.com/',
      startedAt: new Date(),
      finishedAt: new Date(),
      tool: {
        playwrightVersion: '1.49.0',
        chromiumVersion: '130.0.0.0',
        axeCoreVersion: null,
        lighthouseVersion: null,
      },
      config: {
        maxPages: 1,
        maxDepth: 0,
        crawlDelayMs: 0,
        pageTimeoutMs: 30000,
        lighthouseTimeoutMs: 60000,
        userAgent: 'OdysseusAuditBot/0.1',
      },
      crawl: buildCrawlResult(),
      pages: [],
    });

    expect(manifest.tool.axeCoreVersion).toBeNull();
    expect(manifest.tool.lighthouseVersion).toBeNull();
  });
});
