import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { computeDominantPerformanceMetric } from './dominant-metric.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function loadHaaitzaManifest(): AuditManifest {
  const manifestPath = path.join(
    moduleDir,
    '../../../artifacts/haaitza.com/2026-08-06T20-30-06Z/manifest.json',
  );
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as AuditManifest;
}

function buildManifest(pages: AuditManifest['pages']): AuditManifest {
  return {
    auditId: 'audit-1',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-08-02T00:00:00Z',
    finishedAt: '2026-08-02T00:05:00Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '131.0.0',
    },
    config: {
      maxPages: 50,
      maxDepth: 3,
      crawlDelayMs: 500,
      pageTimeoutMs: 30000,
      lighthouseTimeoutMs: 45000,
      userAgent: 'OdysseusBot/1.0',
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: pages.length,
      maxPages: 50,
      maxDepth: 3,
      robotsTxtFound: true,
      effectiveDelayMs: 500,
    },
    pages,
  };
}

describe('computeDominantPerformanceMetric', () => {
  it('picks TBT for the real haaitza scan, where LCP and TBT are both poor on every page but TBT runs further past its threshold', () => {
    // Verified by hand against docs/report-v2-refactor.md A4's own claim
    // ("Total Blocking Time runs to 16,490 ms on the homepage. That is a
    // JavaScript execution problem."): average LCP/threshold ratio ~8.3,
    // average TBT/threshold ratio ~18.2, CLS never poor (all ~0).
    const manifest = loadHaaitzaManifest();

    expect(computeDominantPerformanceMetric(manifest)).toBe('tbt');
  });

  it('returns null when no metric has a poor page', () => {
    const manifest = buildManifest([
      {
        url: 'https://example.com/',
        pageDir: 'pages/home-abc123',
        depth: 0,
        status: 'visited',
        errors: {},
        coreWebVitals: {
          lcp: { score: 1, numericValue: 1500, displayValue: '1.5 s' },
          cls: { score: 1, numericValue: 0.02, displayValue: '0.02' },
          tbt: { score: 1, numericValue: 50, displayValue: '50 ms' },
        },
      },
    ]);

    expect(computeDominantPerformanceMetric(manifest)).toBeNull();
  });

  it('picks CLS when it is the only poor metric', () => {
    const manifest = buildManifest([
      {
        url: 'https://example.com/',
        pageDir: 'pages/home-abc123',
        depth: 0,
        status: 'visited',
        errors: {},
        coreWebVitals: {
          lcp: { score: 1, numericValue: 1500, displayValue: '1.5 s' },
          cls: { score: 0, numericValue: 0.4, displayValue: '0.4' },
          tbt: { score: 1, numericValue: 50, displayValue: '50 ms' },
        },
      },
    ]);

    expect(computeDominantPerformanceMetric(manifest)).toBe('cls');
  });

  it('ignores pages with no coreWebVitals measurement', () => {
    const manifest = buildManifest([
      { url: 'https://example.com/', depth: 0, status: 'visited', errors: {} },
    ]);

    expect(computeDominantPerformanceMetric(manifest)).toBeNull();
  });
});
