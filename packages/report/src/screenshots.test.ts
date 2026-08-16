import { describe, expect, it } from 'vitest';
import { RENDERDIFF_RULE_ID, type AuditManifest, type Finding } from '@odysseus/core';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { loadSasFernandeManifest } from './test-fixtures.js';

function inflateMissingPercent(manifest: AuditManifest, pageDir: string, percent: number): AuditManifest {
  return {
    ...manifest,
    pages: manifest.pages.map((page) =>
      page.pageDir === pageDir ? { ...page, renderDiffMissingPercent: percent } : page,
    ),
  };
}

function buildRenderDiffFinding(
  pageUrl: string,
  rawTextLength: number,
  renderedTextLength: number,
  selector = '.hero',
): Finding {
  return {
    findingId: 'f-renderdiff',
    auditId: 'audit-1',
    schemaVersion: 1,
    source: 'renderdiff',
    ruleId: RENDERDIFF_RULE_ID,
    category: 'rendering',
    severity: 'moderate',
    wcagCriteria: [],
    title: 'Content missing from raw HTML',
    description: 'desc',
    pageUrls: [pageUrl],
    occurrences: 1,
    elements: [{ pageUrl, selector, snippet: '' }],
    rawEvidence: {
      perPage: {
        [pageUrl]: {
          pageUrl,
          rawTextLength,
          renderedTextLength,
          missingPercent: 40,
          consoleErrors: [],
          httpStatus: 200,
        },
      },
    },
    dedupeKey: 'd-renderdiff',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

describe('resolveRenderDiffEvidence against the real sas-fernande.fr capture', () => {
  it('excludes every page when nothing crosses the 5% evidence-inclusion threshold (real data: 0% missing everywhere)', async () => {
    const manifest = await loadSasFernandeManifest();
    const { pages, totalEligible } = resolveRenderDiffEvidence(manifest, []);

    expect(pages).toHaveLength(0);
    expect(totalEligible).toBe(0);
  });

  it('includes a page once its missingPercent crosses the threshold', async () => {
    const manifest = await loadSasFernandeManifest();
    const inflated = inflateMissingPercent(manifest, 'pages/root-c122da', 40);

    const { pages } = resolveRenderDiffEvidence(inflated, []);

    expect(pages).toHaveLength(1);
    expect(pages[0]?.pageUrl).toBe(manifest.crawl.startUrl);
    expect(pages[0]?.missingPercent).toBe(40);
  });

  it('caps at the 3 worst pages by missingPercent and reports how many were eligible', async () => {
    const manifest = await loadSasFernandeManifest();
    // The scan-time prune (selectPageDirsToKeep) always keeps the
    // homepage, plus separately its own top 3 by missingPercent. To reach
    // 4 distinct eligible candidates the homepage must qualify but rank
    // below the 3 others, so its guaranteed keep is additive rather than
    // already covered by the top-3 selection.
    const homepagePageDir = manifest.pages.find((p) => p.url === manifest.crawl.startUrl)?.pageDir;
    let inflated = inflateMissingPercent(manifest, homepagePageDir!, 20);
    const pageDirs = manifest.pages
      .filter((p) => p.pageDir !== undefined && p.pageDir !== homepagePageDir)
      .slice(0, 3);
    for (const [i, page] of pageDirs.entries()) {
      inflated = inflateMissingPercent(inflated, page.pageDir!, 25 + i * 5);
    }

    const { pages, totalEligible } = resolveRenderDiffEvidence(inflated, []);

    expect(totalEligible).toBe(4);
    expect(pages).toHaveLength(3);
    // Sorted by missingPercent descending, no homepage tie-break.
    expect(pages.map((p) => p.missingPercent)).toEqual([35, 30, 25]);
  });

  it('reads rawTextLength/renderedTextLength/selector from the matching text-missing-from-raw-html finding (B17)', async () => {
    const manifest = await loadSasFernandeManifest();
    const homepageUrl = manifest.crawl.startUrl;
    const inflated = inflateMissingPercent(manifest, 'pages/root-c122da', 40);
    const findings = [buildRenderDiffFinding(homepageUrl, 42, 1830, '.hero-copy')];

    const { pages } = resolveRenderDiffEvidence(inflated, findings);

    expect(pages[0]?.rawTextLength).toBe(42);
    expect(pages[0]?.renderedTextLength).toBe(1830);
    expect(pages[0]?.selector).toBe('.hero-copy');
  });

  it('reports null lengths and an empty selector, never a guess, when no renderdiff finding exists for an included page', async () => {
    const manifest = await loadSasFernandeManifest();
    const inflated = inflateMissingPercent(manifest, 'pages/root-c122da', 40);

    const { pages } = resolveRenderDiffEvidence(inflated, []);

    expect(pages[0]?.rawTextLength).toBeNull();
    expect(pages[0]?.renderedTextLength).toBeNull();
    expect(pages[0]?.selector).toBe('');
  });
});
