import { describe, expect, it } from 'vitest';
import { RENDERDIFF_RULE_ID, type AuditManifest, type Finding } from '@odysseus/core';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { buildStubBrowser, loadSasFernandeManifest, SAS_FERNANDE_AUDIT_DIR } from './test-fixtures.js';

function inflateMissingPercent(manifest: AuditManifest, pageDir: string, percent: number): AuditManifest {
  return {
    ...manifest,
    pages: manifest.pages.map((page) =>
      page.pageDir === pageDir ? { ...page, renderDiffMissingPercent: percent } : page,
    ),
  };
}

function buildRenderDiffFinding(pageUrl: string, rawTextLength: number, renderedTextLength: number): Finding {
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
    elements: [],
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
    const pages = await resolveRenderDiffEvidence(manifest, SAS_FERNANDE_AUDIT_DIR, [], buildStubBrowser());

    expect(pages).toHaveLength(0);
  });

  it('includes a page once its missingPercent crosses the threshold, downscaling its real screenshot files', async () => {
    const manifest = await loadSasFernandeManifest();
    // root-c122da (the homepage) is the one pageDir in this fixture with
    // real raw.png/rendered.png on disk.
    const inflated = inflateMissingPercent(manifest, 'pages/root-c122da', 40);

    const pages = await resolveRenderDiffEvidence(inflated, SAS_FERNANDE_AUDIT_DIR, [], buildStubBrowser());

    expect(pages).toHaveLength(1);
    expect(pages[0]?.pageUrl).toBe(manifest.crawl.startUrl);
    expect(pages[0]?.rawDataUri).toBe('data:image/jpeg;base64,ZmFrZQ==');
    expect(pages[0]?.renderedDataUri).toBe('data:image/jpeg;base64,ZmFrZQ==');
  });

  it('falls back to null, not a throw, for a pageDir whose screenshots were pruned', async () => {
    const manifest = await loadSasFernandeManifest();
    // galerie-db444c crosses the threshold but only has scan.json on disk
    // (its screenshots were pruned at scan time).
    const inflated = inflateMissingPercent(manifest, 'pages/galerie-db444c', 40);

    const pages = await resolveRenderDiffEvidence(inflated, SAS_FERNANDE_AUDIT_DIR, [], buildStubBrowser());
    const galerie = pages.find((page) => page.pageUrl.includes('galerie'));

    expect(galerie?.rawDataUri).toBeNull();
    expect(galerie?.renderedDataUri).toBeNull();
  });

  it('reads rawTextLength/renderedTextLength from the matching text-missing-from-raw-html finding (B17)', async () => {
    const manifest = await loadSasFernandeManifest();
    const homepageUrl = manifest.crawl.startUrl;
    const inflated = inflateMissingPercent(manifest, 'pages/root-c122da', 40);
    const findings = [buildRenderDiffFinding(homepageUrl, 42, 1830)];

    const pages = await resolveRenderDiffEvidence(inflated, SAS_FERNANDE_AUDIT_DIR, findings, buildStubBrowser());

    expect(pages[0]?.rawTextLength).toBe(42);
    expect(pages[0]?.renderedTextLength).toBe(1830);
  });

  it('reports null lengths, never a guess, when no renderdiff finding exists for an included page', async () => {
    const manifest = await loadSasFernandeManifest();
    const inflated = inflateMissingPercent(manifest, 'pages/root-c122da', 40);

    const pages = await resolveRenderDiffEvidence(inflated, SAS_FERNANDE_AUDIT_DIR, [], buildStubBrowser());

    expect(pages[0]?.rawTextLength).toBeNull();
    expect(pages[0]?.renderedTextLength).toBeNull();
  });
});
