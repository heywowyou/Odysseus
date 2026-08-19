import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import { computeStatistics } from './statistics.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function loadHaaitzaAuditDir(): string {
  return path.join(moduleDir, '../../../../artifacts/haaitza.com/2026-08-06T20-30-06Z');
}

function loadHaaitzaFindings(): Finding[] {
  return JSON.parse(readFileSync(path.join(loadHaaitzaAuditDir(), 'findings.json'), 'utf-8')) as Finding[];
}

function loadHaaitzaManifest(): AuditManifest {
  return JSON.parse(readFileSync(path.join(loadHaaitzaAuditDir(), 'manifest.json'), 'utf-8')) as AuditManifest;
}

describe('computeStatistics', () => {
  it('matches every number the doc itself verified against the real haaitza scan', () => {
    const findings = loadHaaitzaFindings();
    const manifest = loadHaaitzaManifest();

    const stats = computeStatistics(findings, manifest);
    const { categoryCounts, ...rest } = stats;

    expect(rest).toEqual({
      pagesScanned: 20,
      totalFindings: 103,
      accessibilityOccurrences: 431,
      pagesWithCritical: 20,
      critical: 8,
      serious: 20,
      moderate: 15,
      minor: 60,
      wcagCriteriaFailingCount: 7,
      pagesWithWcagFailure: 20,
      accessibilityCount: 23,
      seoRenderingCount: 16,
      // item 39: the real haaitza manifest predates renderDiffMissingPercent
      // being recorded per page, so this is false here, not a claim that
      // no below-threshold gap exists on that site.
      hasBelowThresholdRenderGap: false,
    });
    // categoryCounts checked structurally rather than against a second
    // hand-verified table: it must sum to totalFindings (every finding
    // lands in exactly one of the 4 CATEGORY_ORDER categories, 'geo'
    // excluded per design-tokens.ts) and its accessibility figure must
    // match the existing, doc-verified accessibilityCount.
    const categorySum = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    expect(categorySum).toBe(stats.totalFindings);
    expect(categoryCounts.accessibility).toBe(stats.accessibilityCount);
    expect(categoryCounts.seo + categoryCounts.rendering).toBe(stats.seoRenderingCount);
  });
});

// item 39: "Rendu : 0" contradicted section 08's own reported gap when
// that gap sits below the render-diff finding-emission threshold - a
// real, below-threshold percentage, not a bug or a genuine absence.
describe('item 39: hasBelowThresholdRenderGap', () => {
  function buildManifest(missingPercents: (number | undefined)[]): AuditManifest {
    return {
      auditId: 'a1',
      kind: 'audit',
      siteUrl: 'https://example.com',
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      tool: {} as AuditManifest['tool'],
      config: {} as AuditManifest['config'],
      crawl: {
        startUrl: 'https://example.com/',
        visitedCount: missingPercents.length,
        maxPages: 20,
        maxDepth: 3,
        robotsTxtFound: false,
        effectiveDelayMs: 500,
      },
      pages: missingPercents.map((p, i) => ({
        url: `https://example.com/${i}`,
        depth: 0,
        status: 'visited' as const,
        errors: {},
        ...(p !== undefined ? { renderDiffMissingPercent: p } : {}),
      })),
    };
  }

  it('is true when a page has a real gap below the 20% emission threshold (the reported 13% case)', () => {
    const stats = computeStatistics([], buildManifest([13]));
    expect(stats.hasBelowThresholdRenderGap).toBe(true);
  });

  it('is false when no page has any measured gap', () => {
    const stats = computeStatistics([], buildManifest([undefined]));
    expect(stats.hasBelowThresholdRenderGap).toBe(false);
  });

  it('is false when the only gap is at or above the emission threshold (a real finding already covers it)', () => {
    const stats = computeStatistics([], buildManifest([25]));
    expect(stats.hasBelowThresholdRenderGap).toBe(false);
  });

  it('is false when the only gap is below the evidence-inclusion threshold (genuinely negligible)', () => {
    const stats = computeStatistics([], buildManifest([2]));
    expect(stats.hasBelowThresholdRenderGap).toBe(false);
  });

  // report-feedback-la-corniche.md item 0.5 [REGRESSION]: a real report
  // measured a 62% gap on one page (well above the emission threshold,
  // so a genuine rendering-category finding exists) and a below-threshold
  // gap on another page, and the footnote still fired, printing "la
  // catégorie Rendu affiche 0 constat" directly under a tile reading "1".
  it('is false when a rendering finding already exists, even if a different page also has a below-threshold gap', () => {
    const renderingFinding: Finding = {
      auditId: 'a1',
      schemaVersion: 1,
      source: 'renderdiff',
      findingId: 'f1',
      ruleId: 'text-missing-from-raw-html',
      category: 'rendering',
      severity: 'serious',
      wcagCriteria: [],
      title: 'Content invisible to a non-JavaScript crawler',
      description: 'description',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'dk-1',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const stats = computeStatistics([renderingFinding], buildManifest([62, 13]));
    expect(stats.categoryCounts.rendering).toBe(1);
    expect(stats.hasBelowThresholdRenderGap).toBe(false);
  });
});
