import { describe, expect, it } from 'vitest';
import { resolveRenderDiffEvidence } from './screenshots.js';
import { loadSasFernandeManifest, SAS_FERNANDE_AUDIT_DIR } from './test-fixtures.js';

describe('resolveRenderDiffEvidence against the real sas-fernande.fr capture', () => {
  it('lists the homepage first, with its screenshots resolved as data URIs', async () => {
    const manifest = await loadSasFernandeManifest();
    const pages = await resolveRenderDiffEvidence(manifest, SAS_FERNANDE_AUDIT_DIR);

    expect(pages.length).toBeGreaterThan(0);
    expect(pages[0]?.isHomepage).toBe(true);
    expect(pages[0]?.pageUrl).toBe(manifest.crawl.startUrl);
    // root-c122da is the one pageDir this capture kept both screenshots for.
    expect(pages[0]?.rawDataUri).toMatch(/^data:image\/png;base64,/);
    expect(pages[0]?.renderedDataUri).toMatch(/^data:image\/png;base64,/);
  });

  it('never returns a pageDir outside what selectPageDirsToKeep would keep', async () => {
    const manifest = await loadSasFernandeManifest();
    const pages = await resolveRenderDiffEvidence(manifest, SAS_FERNANDE_AUDIT_DIR);

    // This capture's render diff was 0 on every page (server-rendered site),
    // so nothing crosses the emission threshold and only the homepage survives.
    expect(pages).toHaveLength(1);
  });

  it('falls back to null, not a throw, for a pageDir whose screenshots were pruned', async () => {
    const manifest = await loadSasFernandeManifest();
    // Force a non-homepage, non-kept page into the candidate set by pointing
    // resolveRenderDiffEvidence at a manifest with an inflated missingPercent,
    // simulating a page that would have been kept but whose files are gone.
    const inflated = {
      ...manifest,
      pages: manifest.pages.map((page) =>
        page.pageDir === 'pages/galerie-db444c'
          ? { ...page, renderDiffMissingPercent: 99 }
          : page,
      ),
    };
    const pages = await resolveRenderDiffEvidence(inflated, SAS_FERNANDE_AUDIT_DIR);
    const galerie = pages.find((page) => page.pageUrl.includes('galerie'));
    expect(galerie?.rawDataUri).toBeNull();
    expect(galerie?.renderedDataUri).toBeNull();
  });
});
