import { describe, expect, it } from 'vitest';
import { RENDERDIFF_RULE_ID, type AuditManifest, type Finding } from '@odysseus/core';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { loadSasFernandeManifest } from './test-fixtures.js';

function inflateMissingPercent(
  manifest: AuditManifest,
  pageDir: string,
  percent: number,
): AuditManifest {
  return {
    ...manifest,
    pages: manifest.pages.map((page) =>
      page.pageDir === pageDir ? { ...page, renderDiffMissingPercent: percent } : page,
    ),
  };
}

function overridePageUrl(manifest: AuditManifest, pageDir: string, url: string): AuditManifest {
  return {
    ...manifest,
    pages: manifest.pages.map((page) => (page.pageDir === pageDir ? { ...page, url } : page)),
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
    // item 1.9: the homepage leads (its 20% ranks it last by gap size
    // alone, but the homepage tie-break below puts it first regardless),
    // then the remaining two slots go to the next-worst pages by gap
    // (35, 30), dropping the third (25).
    expect(pages.map((p) => p.missingPercent)).toEqual([20, 35, 30]);
    expect(pages[0]?.pageUrl).toBe(manifest.crawl.startUrl);
  });

  // report-feedback-la-corniche.md item 1.9: a real report led this
  // section with the site's own /plan-de-site-*/ page - the least
  // commercially relevant page it visited - above the homepage, purely
  // because its gap happened to be a few points wider. Full page-
  // commercial-value weighting is deferred; promoting the homepage
  // specifically is the one generic, already-available signal (no new
  // heuristic) that directly fixes "the sitemap page is never allowed to
  // outrank the homepage as the lead example".
  it('item 1.9: the homepage leads even when a non-homepage page has a strictly larger gap', async () => {
    const manifest = await loadSasFernandeManifest();
    const homepagePageDir = manifest.pages.find((p) => p.url === manifest.crawl.startUrl)?.pageDir;
    const otherPageDir = manifest.pages.find(
      (p) => p.pageDir !== undefined && p.pageDir !== homepagePageDir,
    )?.pageDir;

    let inflated = inflateMissingPercent(manifest, homepagePageDir!, 25);
    inflated = inflateMissingPercent(inflated, otherPageDir!, 75);

    const { pages } = resolveRenderDiffEvidence(inflated, []);

    expect(pages[0]?.pageUrl).toBe(manifest.crawl.startUrl);
    expect(pages[0]?.missingPercent).toBe(25);
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

  it('excludes a wrapper page (>=95% missing) from evidence, unlike an ordinary page below that threshold (B6)', async () => {
    const manifest = await loadSasFernandeManifest();
    const inflated = inflateMissingPercent(manifest, 'pages/root-c122da', 96);

    const { pages, totalEligible, wrapperOrLegalExcludedCount } = resolveRenderDiffEvidence(
      inflated,
      [],
    );

    expect(pages).toHaveLength(0);
    expect(totalEligible).toBe(0);
    expect(wrapperOrLegalExcludedCount).toBe(1);
  });

  it('excludes a legal-noindex page by URL pattern, regardless of its missingPercent (B6)', async () => {
    const manifest = await loadSasFernandeManifest();
    const withLegalUrl = overridePageUrl(
      manifest,
      'pages/root-c122da',
      'https://example.com/mentions-legales/',
    );
    const inflated = inflateMissingPercent(withLegalUrl, 'pages/root-c122da', 40);

    const { pages, wrapperOrLegalExcludedCount } = resolveRenderDiffEvidence(inflated, []);

    expect(pages).toHaveLength(0);
    expect(wrapperOrLegalExcludedCount).toBe(1);
  });

  it('ranks by absolute characters missing, not by missingPercent, when both pages have a backing finding (B6)', async () => {
    const manifest = await loadSasFernandeManifest();
    // item 1.9 added a homepage tie-break ahead of this ranking (its own
    // test above), so this case now deliberately uses two non-homepage
    // pages to keep isolating the B6 char-ranking rule on its own.
    const homepagePageDir = manifest.pages.find((p) => p.url === manifest.crawl.startUrl)?.pageDir;
    const nonHomepageDirs = manifest.pages.filter(
      (p) => p.pageDir !== undefined && p.pageDir !== homepagePageDir,
    );
    const smallGapPageDir = nonHomepageDirs[0]!.pageDir!;
    const bigGapPageDir = nonHomepageDirs[1]!.pageDir!;

    // Small-gap page: higher missingPercent (30%) but a smaller absolute
    // gap. Big-gap page: lower missingPercent (20%) but a much larger
    // absolute gap (4,000 chars vs 300). The 4,000-char page must rank
    // first.
    let manifestWithGaps = inflateMissingPercent(manifest, smallGapPageDir, 30);
    manifestWithGaps = inflateMissingPercent(manifestWithGaps, bigGapPageDir, 20);

    const findings = [
      buildRenderDiffFinding(
        manifest.pages.find((p) => p.pageDir === smallGapPageDir)!.url,
        700,
        1000,
        '.thin',
      ),
      buildRenderDiffFinding(
        manifest.pages.find((p) => p.pageDir === bigGapPageDir)!.url,
        1000,
        5000,
        '.big-gap',
      ),
    ];

    const { pages } = resolveRenderDiffEvidence(manifestWithGaps, findings);

    expect(pages[0]?.pageUrl).toBe(manifest.pages.find((p) => p.pageDir === bigGapPageDir)!.url);
    expect(pages[0]?.missingPercent).toBe(20);
  });
});
