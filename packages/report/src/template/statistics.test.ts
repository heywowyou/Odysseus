import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import { computeSiteStats } from '@odysseus/llm';
import { computeStatistics } from './statistics.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function loadMultiPageAuditDir(): string {
  return path.join(moduleDir, '../../../../fixtures/test-audits/multi-page');
}

function loadMultiPageFindings(): Finding[] {
  return JSON.parse(
    readFileSync(path.join(loadMultiPageAuditDir(), 'findings.json'), 'utf-8'),
  ) as Finding[];
}

function loadMultiPageManifest(): AuditManifest {
  return JSON.parse(
    readFileSync(path.join(loadMultiPageAuditDir(), 'manifest.json'), 'utf-8'),
  ) as AuditManifest;
}

describe('computeStatistics', () => {
  it('matches every number the doc itself verified against the real multi-page scan', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();

    const stats = computeStatistics(findings, manifest);
    const { categoryCounts, ...rest } = stats;

    // 2026-08-25: these were the numbers the doc verified against this
    // fixture as it stood months ago. Re-deriving it with `normalize <dir>`
    // this session brought it up to date with every dedupe and collapse
    // change shipped since, and the totals moved (103 findings to 62). They
    // are re-recorded rather than loosened, because here the number IS the
    // thing under test - this block exists to catch computeStatistics
    // drifting, not to describe the fixture.
    //
    // Q1 (Plan 075): only findings wholly inside embedded frames leave the
    // primary totals and grade. This fixture has none. Its six vendor
    // findings (Gravity Forms, SmartPreview, the Diadao widget, Complianz)
    // are rendered in the page's own DOM, so they keep counting, including
    // the critical unnamed Gravity Forms submit button.
    expect(rest).toEqual({
      pagesScanned: 20,
      totalFindings: 62,
      accessibilityOccurrences: 431,
      // item 1.8: this real fixture predates alt-text-quality-heuristic
      // findings, so this is 0 here, not a claim that no site ever
      // triggers the heuristic - see the dedicated describe block below
      // for the exclusion behaviour itself.
      accessibilityHeuristicOccurrences: 0,
      thirdPartyAccessibilityOccurrences: 129,
      confinedThirdPartyFindingCount: 0,
      confinedThirdPartyOccurrenceCount: 0,
      unlinkedSitemapFindingCount: 0,
      unconfirmedRuleFindingCount: 0,
      unlinkedSitemapPageCount: 0,
      pagesWithCritical: 20,
      critical: 8,
      serious: 14,
      moderate: 15,
      minor: 25,
      wcagCriteriaFailingCount: 7,
      pagesWithWcagFailure: 20,
      accessibilityCount: 17,
      seoRenderingCount: 16,
      // item 39: the real multi-page manifest predates renderDiffMissingPercent
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

// item 1.8 (Large Rule Families pass): the accessibility-occurrences tile used to
// include alt-text-quality-heuristic occurrences with no caveat next to
// three genuinely hard counts - a real report had 74 of 703 (10 percent)
// come from the heuristic alone.
describe('item 1.8: heuristic occurrences are excluded from accessibilityOccurrences', () => {
  function buildFinding(
    overrides: Partial<Finding> & Pick<Finding, 'findingId' | 'ruleId' | 'occurrences'>,
  ): Finding {
    return {
      auditId: 'a1',
      schemaVersion: 1,
      source: 'custom',
      category: 'accessibility',
      severity: 'moderate',
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls: ['https://example.com/'],
      elements: [],
      rawEvidence: {},
      dedupeKey: overrides.findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    };
  }

  const manifest: AuditManifest = {
    auditId: 'a1',
    kind: 'audit',
    siteUrl: 'https://example.com',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    tool: {} as AuditManifest['tool'],
    config: {} as AuditManifest['config'],
    crawl: {} as AuditManifest['crawl'],
    pages: [{ url: 'https://example.com/', status: 'visited' } as AuditManifest['pages'][number]],
  };

  it('splits real conformance occurrences from heuristic occurrences into two figures', () => {
    const findings = [
      buildFinding({ findingId: 'f1', ruleId: 'image-alt', occurrences: 10 }),
      buildFinding({ findingId: 'f2', ruleId: 'alt-text-quality-heuristic', occurrences: 74 }),
    ];

    const stats = computeStatistics(findings, manifest);
    expect(stats.accessibilityOccurrences).toBe(10);
    expect(stats.accessibilityHeuristicOccurrences).toBe(74);
  });

  it('does not affect accessibilityCount, which still includes the heuristic finding itself', () => {
    const findings = [
      buildFinding({ findingId: 'f1', ruleId: 'image-alt', occurrences: 10 }),
      buildFinding({ findingId: 'f2', ruleId: 'alt-text-quality-heuristic', occurrences: 74 }),
    ];

    const stats = computeStatistics(findings, manifest);
    expect(stats.accessibilityCount).toBe(2);
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

  // report-feedback-large-rule-families.md item 0.5 [REGRESSION]: a real report
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

describe('computeStatistics with a sitemap-only majority (plan 075, Q4)', () => {
  it('keeps findings found only on unlinked sitemap pages out of the totals', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();
    const visited = manifest.pages.filter((page) => page.status === 'visited');
    const linked = new Set(visited.slice(0, Math.floor(visited.length / 3)).map((p) => p.url));
    const withBacklog: AuditManifest = {
      ...manifest,
      pages: manifest.pages.map((page) =>
        page.status === 'visited' && !linked.has(page.url)
          ? { ...page, discoveryMethod: 'sitemap-only' }
          : page,
      ),
    };
    const onlyUnlinked = findings.filter(
      (finding) => finding.pageUrls.length > 0 && finding.pageUrls.every((url) => !linked.has(url)),
    );
    expect(onlyUnlinked.length).toBeGreaterThan(0);

    const before = computeStatistics(findings, manifest);
    const after = computeStatistics(findings, withBacklog);

    expect(after.unlinkedSitemapFindingCount).toBe(onlyUnlinked.length);
    expect(after.unlinkedSitemapPageCount).toBe(visited.length - linked.size);
    expect(after.totalFindings).toBe(before.totalFindings - onlyUnlinked.length);
  });

  // A custom rule no real finding has confirmed yet (core's
  // rule-confirmation.ts): its findings leave every count and the grade.
  it('keeps unconfirmed-rule findings out of every count', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();
    const template = findings.find((finding) => finding.severity === 'critical') ?? findings[0]!;
    const unconfirmed: Finding = {
      ...template,
      findingId: 'unconfirmed-1',
      dedupeKey: 'unconfirmed-1',
      ruleId: 'focus-order-mismatch',
      source: 'custom',
      category: 'accessibility',
      severity: 'critical',
    };

    const before = computeStatistics(findings, manifest);
    const after = computeStatistics([...findings, unconfirmed], manifest);

    expect(after.unconfirmedRuleFindingCount).toBe(1);
    expect(after.totalFindings).toBe(before.totalFindings);
    expect(after.critical).toBe(before.critical);
  });

  it('counts sitemap-only pages like any other when they are a minority', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();
    const firstVisited = manifest.pages.find((page) => page.status === 'visited')!.url;
    const oneOrphan: AuditManifest = {
      ...manifest,
      pages: manifest.pages.map((page) =>
        page.url === firstVisited ? { ...page, discoveryMethod: 'sitemap-only' } : page,
      ),
    };
    expect(computeStatistics(findings, oneOrphan)).toEqual(computeStatistics(findings, manifest));
  });
});

describe('the writing pass sees the totals the statistics tiles print (issue #543)', () => {
  it('counts the same primary population with all four buckets present', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();
    const visited = manifest.pages.filter((page) => page.status === 'visited');
    const linked = new Set(visited.slice(0, Math.floor(visited.length / 3)).map((p) => p.url));
    const withBacklog: AuditManifest = {
      ...manifest,
      pages: manifest.pages.map((page) =>
        page.status === 'visited' && !linked.has(page.url)
          ? { ...page, discoveryMethod: 'sitemap-only' }
          : page,
      ),
    };
    const template = findings[0]!;
    const frameOnly: Finding = {
      ...template,
      findingId: 'frame-1',
      dedupeKey: 'frame-1',
      pageUrls: [[...linked][0]!],
      elements: [{ ...template.elements[0]!, selector: 'iframe#booking >>> button' }],
    };
    const unconfirmed: Finding = {
      ...template,
      findingId: 'unconfirmed-1',
      dedupeKey: 'unconfirmed-1',
      ruleId: 'focus-order-mismatch',
      source: 'custom',
      pageUrls: [[...linked][0]!],
    };
    const all = [...findings, frameOnly, unconfirmed];

    const tiles = computeStatistics(all, withBacklog);
    const siteStats = computeSiteStats(all, withBacklog);

    expect(tiles.unlinkedSitemapFindingCount).toBeGreaterThan(0);
    expect(tiles.confinedThirdPartyFindingCount).toBe(1);
    expect(tiles.unconfirmedRuleFindingCount).toBe(1);
    expect(siteStats).toMatchObject({
      totalFindings: tiles.totalFindings,
      critical: tiles.critical,
      serious: tiles.serious,
      moderate: tiles.moderate,
      minor: tiles.minor,
    });
  });
});
