import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./versions.js', () => ({
  collectToolVersions: vi.fn(async () => ({
    axeCoreVersion: 'test',
    lighthouseVersion: 'test',
    playwrightVersion: 'test',
    chromiumVersion: 'test',
  })),
}));

import { writeAuditArtifacts } from './write-audit.js';
import { writePageScanJson } from './page-scan-io.js';
import { buildAuditDir } from './paths.js';

let root: string;
let previousRoot: string | undefined;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-write-audit-unit-'));
  previousRoot = process.env.ODYSSEUS_ARTIFACTS_ROOT;
  process.env.ODYSSEUS_ARTIFACTS_ROOT = root;
});

afterEach(async () => {
  if (previousRoot === undefined) delete process.env.ODYSSEUS_ARTIFACTS_ROOT;
  else process.env.ODYSSEUS_ARTIFACTS_ROOT = previousRoot;
  await fs.rm(root, { recursive: true, force: true });
});

describe('writeAuditArtifacts characterization', () => {
  it('writes portable page artifacts and preserves skipped, errored, site and translation facts', async () => {
    const home = 'https://example.com/';
    const legal = 'https://example.com/mentions-legales';
    const screenshot = path.join(root, 'elsewhere', 'raw.png');
    const result = await writeAuditArtifacts({
      auditId: 'audit-write-unit',
      kind: 'audit',
      browser: {} as never,
      startedAt: new Date('2026-08-29T10:00:00.000Z'),
      finishedAt: new Date('2026-08-29T10:01:00.000Z'),
      config: {
        maxPages: 3,
        maxDepth: 2,
        crawlDelayMs: 0,
        pageTimeoutMs: 30_000,
        lighthouseTimeoutMs: 60_000,
        userAgent: 'test',
        scanConcurrency: 2,
        sitemapMode: 'supplement',
      },
      siteResult: {
        analysisCoverageByUrl: new Map([
          [
            home,
            {
              plannerVersion: 'v1',
              role: 'content',
              confidence: 'high',
              templateFamilyId: 'family-a',
              reasonCodes: ['content-json-ld'],
              passes: {
                rendered: { outcome: 'completed' },
                axe: { outcome: 'completed' },
                extended: { outcome: 'completed' },
                lighthouse: { outcome: 'completed' },
              },
            },
          ],
          [
            legal,
            {
              plannerVersion: 'v1',
              role: 'utility',
              confidence: 'fallback',
              reasonCodes: ['utility-signal-only'],
              passes: {
                rendered: { outcome: 'completed' },
                axe: { outcome: 'completed' },
                extended: { outcome: 'partial', failedCheckIds: ['reflow'] },
                lighthouse: { outcome: 'failed', failedCheckIds: ['lighthouse'] },
              },
            },
          ],
        ]),
        crawl: {
          startUrl: home,
          pages: [
            { url: home, depth: 0, status: 'visited', discoveryMethod: 'link', httpStatus: 200 },
            {
              url: legal,
              depth: 1,
              status: 'visited',
              discoveryMethod: 'link',
              httpStatus: 200,
            },
            {
              url: `${home}private`,
              depth: 1,
              status: 'robots-disallowed',
              discoveryMethod: 'link',
              error: 'blocked',
            },
          ],
          effectiveDelayMs: 0,
          visitedCount: 2,
          maxPages: 3,
          maxDepth: 2,
          robotsTxtFound: true,
          robotsDisallowMatches: [`${home}private`],
          aiCrawlerBlocks: [],
          mentionsLegalesPageUrl: legal,
          linkDiscoveredUrls: [legal, `${home}private`],
          continuationGuardSummary: {
            guardVersion: 'v1',
            familyMaxEnqueued: 60,
            families: [],
            additionalFamiliesOmittedCount: 0,
            totalOmittedUrlCount: 3,
          },
        } as never,
        pages: [
          {
            url: home,
            renderDiff: {
              rawScreenshotRef: screenshot,
              renderedScreenshotRef: path.join(root, 'elsewhere', 'rendered.png'),
              missingPercent: 25,
            } as never,
            renderDiffError: 'partial render error',
            securityHeaders: {} as never,
            cookieConsent: {} as never,
            transactionalFlowEvidence: [
              { kind: 'checkout-form', selector: 'form', pageUrl: home, detail: 'checkout' },
            ],
            headMetadata: {
              title: 'Example',
              openGraphTags: { 'og:site_name': 'Example' },
              hreflangLinks: [
                { lang: 'fr', href: home },
                { lang: 'en', href: `${home}en` },
              ],
            } as never,
          },
          {
            url: legal,
            mentionsLegales: { siren: '732829320' } as never,
            headMetadata: {
              title: 'Mentions | Example',
              openGraphTags: {},
              hreflangLinks: [],
            } as never,
            lighthouseError: 'timed out',
          },
        ],
      },
    });

    const diskManifest = JSON.parse(
      await fs.readFile(path.join(result.auditDir, 'manifest.json'), 'utf-8'),
    );
    expect(diskManifest.auditId).toBe('audit-write-unit');
    expect(diskManifest.pages).toHaveLength(3);
    expect(diskManifest.pages[2]).toMatchObject({
      status: 'robots-disallowed',
      crawlError: 'blocked',
    });
    expect(result.manifest.siteSignals).toMatchObject({
      siren: '732829320',
      hasTransactionalFlow: true,
      siteName: 'Example',
    });
    expect(result.manifest.translationClusters).toBeDefined();
    expect(result.manifest.privacySecurityCoverage).toEqual({
      securityHeaders: 'completed',
      cookieConsent: 'completed',
    });
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]?.renderDiff?.rawScreenshotRef).not.toBe(screenshot);
    expect(path.isAbsolute(result.pages[0]?.renderDiff?.rawScreenshotRef ?? '/')).toBe(false);
    const homeEntry = result.manifest.pages.find((page) => page.url === home);
    expect(homeEntry?.errors.renderDiff).toBe('partial render error');
    expect(homeEntry?.analysisCoverage?.passes.lighthouse.outcome).toBe('completed');
    const legalEntry = result.manifest.pages.find((page) => page.url === legal);
    expect(legalEntry?.errors.lighthouse).toBe('timed out');
    expect(legalEntry?.analysisCoverage?.passes.extended).toEqual({
      outcome: 'partial',
      failedCheckIds: ['reflow'],
    });
    expect(result.manifest.pages[2]?.analysisCoverage).toBeUndefined();
    expect(result.manifest.continuationGuardSummary?.totalOmittedUrlCount).toBe(3);
  });

  it('issue #64: falls back to a scan.json already on disk for a visited page absent from siteResult.pages', async () => {
    const home = 'https://example.com/';
    const staged = 'https://example.com/staged';
    const startedAt = new Date('2026-09-05T10:00:00.000Z');

    // Simulates what scanSite's writePagesAsScanned already wrote to disk
    // for `staged` during the run, before writeAuditArtifacts ever sees it.
    const auditDir = buildAuditDir(root, 'example.com', startedAt);
    const pagesDir = path.join(auditDir, 'pages');
    writePageScanJson(pagesDir, auditDir, {
      url: staged,
      axe: {
        violations: [],
        passes: [],
        testEngine: { name: 'axe-core', version: '4.0.0' },
      } as never,
      headMetadata: {
        title: 'Staged',
        openGraphTags: {},
        hreflangLinks: [],
      } as never,
    });

    const result = await writeAuditArtifacts({
      auditId: 'audit-disk-fallback',
      kind: 'audit',
      browser: {} as never,
      startedAt,
      finishedAt: new Date('2026-09-05T10:01:00.000Z'),
      config: {
        maxPages: 2,
        maxDepth: 2,
        crawlDelayMs: 0,
        pageTimeoutMs: 30_000,
        lighthouseTimeoutMs: 60_000,
        userAgent: 'test',
        scanConcurrency: 2,
        sitemapMode: 'supplement',
      },
      siteResult: {
        crawl: {
          startUrl: home,
          pages: [
            { url: home, depth: 0, status: 'visited', discoveryMethod: 'link', httpStatus: 200 },
            {
              url: staged,
              depth: 1,
              status: 'visited',
              discoveryMethod: 'link',
              httpStatus: 200,
            },
          ],
          effectiveDelayMs: 0,
          visitedCount: 2,
          maxPages: 2,
          maxDepth: 2,
          robotsTxtFound: true,
          robotsDisallowMatches: [],
          aiCrawlerBlocks: [],
          linkDiscoveredUrls: [staged],
        } as never,
        // `staged` is deliberately absent here: writeAuditArtifacts must
        // fall back to the scan.json already on disk instead of dropping
        // it to a crawl-only manifest entry.
        pages: [{ url: home } as never],
      },
    });

    expect(result.auditDir).toBe(auditDir);
    const stagedEntry = result.manifest.pages.find((page) => page.url === staged);
    expect(stagedEntry?.status).toBe('visited');
    expect(stagedEntry?.pageDir).toBeDefined();

    const normalizedStaged = result.pages.find((page) => page.url === staged);
    expect(normalizedStaged).toBeDefined();
    expect(normalizedStaged?.axe?.violations).toEqual([]);
    expect(normalizedStaged?.headMetadata?.title).toBe('Staged');
  });

  // Issue #85: render-diff's settled rendered URL can differ from the
  // requested URL when a client-side redirect fires after 'load' but
  // before the best-effort networkidle wait finishes. That page's
  // rendered content genuinely belongs to another URL, so it must be
  // excluded from analysis coverage rather than counted as visited.
  it('issue #85: marks a page redirect-interstitial when render diff settles on another URL', async () => {
    const home = 'https://example.com/';
    const frRedirect = 'https://example.com/fr';
    const startedAt = new Date('2026-09-06T10:00:00.000Z');

    const result = await writeAuditArtifacts({
      auditId: 'audit-redirect-interstitial',
      kind: 'audit',
      browser: {} as never,
      startedAt,
      finishedAt: new Date('2026-09-06T10:01:00.000Z'),
      config: {
        maxPages: 2,
        maxDepth: 2,
        crawlDelayMs: 0,
        pageTimeoutMs: 30_000,
        lighthouseTimeoutMs: 60_000,
        userAgent: 'test',
        scanConcurrency: 2,
        sitemapMode: 'supplement',
      },
      siteResult: {
        analysisCoverageByUrl: new Map([
          [
            frRedirect,
            {
              plannerVersion: 'v1',
              role: 'content',
              confidence: 'high',
              reasonCodes: ['content-json-ld'],
              passes: {
                rendered: { outcome: 'completed' },
                axe: { outcome: 'completed' },
                extended: { outcome: 'completed' },
                lighthouse: { outcome: 'completed' },
              },
            } as never,
          ],
        ]),
        crawl: {
          startUrl: home,
          pages: [
            { url: home, depth: 0, status: 'visited', discoveryMethod: 'link', httpStatus: 200 },
            {
              url: frRedirect,
              depth: 1,
              status: 'visited',
              discoveryMethod: 'link',
              httpStatus: 200,
              discoveredFrom: home,
            },
          ],
          effectiveDelayMs: 0,
          visitedCount: 2,
          maxPages: 2,
          maxDepth: 2,
          robotsTxtFound: true,
          robotsDisallowMatches: [],
          aiCrawlerBlocks: [],
          linkDiscoveredUrls: [frRedirect],
        } as never,
        pages: [
          { url: home } as never,
          {
            url: frRedirect,
            renderDiff: {
              rawScreenshotRef: path.join(root, 'raw.png'),
              renderedScreenshotRef: path.join(root, 'rendered.png'),
              missingPercent: 0,
              renderedLandedUrl: home,
            } as never,
          },
        ],
      },
    });

    const redirectEntry = result.manifest.pages.find((page) => page.url === frRedirect);
    expect(redirectEntry?.status).toBe('redirect-interstitial');
    expect(redirectEntry?.redirectTargetUrl).toBe(home);
    expect(redirectEntry?.analysisCoverage).toBeUndefined();

    const homeEntry = result.manifest.pages.find((page) => page.url === home);
    expect(homeEntry?.status).toBe('visited');
  });

  it('issue #302: marks a 200 serving an error template soft-error-page and withholds its coverage', async () => {
    const home = 'https://example.com/';
    const errorPage = 'https://example.com/erreur-404';
    const startedAt = new Date('2026-09-16T10:00:00.000Z');
    const coverage = {
      plannerVersion: 'v1',
      role: 'content',
      confidence: 'high',
      reasonCodes: ['content-json-ld'],
      passes: {
        rendered: { outcome: 'completed' },
        axe: { outcome: 'completed' },
        extended: { outcome: 'completed' },
        lighthouse: { outcome: 'completed' },
      },
    } as never;

    const result = await writeAuditArtifacts({
      auditId: 'audit-soft-error',
      kind: 'audit',
      browser: {} as never,
      startedAt,
      finishedAt: new Date('2026-09-16T10:01:00.000Z'),
      config: {
        maxPages: 2,
        maxDepth: 2,
        crawlDelayMs: 0,
        pageTimeoutMs: 30_000,
        lighthouseTimeoutMs: 60_000,
        userAgent: 'test',
        scanConcurrency: 2,
        sitemapMode: 'supplement',
      },
      siteResult: {
        analysisCoverageByUrl: new Map([
          [home, coverage],
          [errorPage, coverage],
        ]),
        crawl: {
          startUrl: home,
          pages: [
            { url: home, depth: 0, status: 'visited', discoveryMethod: 'link', httpStatus: 200 },
            {
              url: errorPage,
              depth: 1,
              status: 'visited',
              discoveryMethod: 'link',
              httpStatus: 200,
              discoveredFrom: home,
            },
          ],
          effectiveDelayMs: 0,
          visitedCount: 2,
          maxPages: 2,
          maxDepth: 2,
          robotsTxtFound: true,
          robotsDisallowMatches: [],
          aiCrawlerBlocks: [],
          linkDiscoveredUrls: [errorPage],
        } as never,
        pages: [
          { url: home } as never,
          {
            url: errorPage,
            headMetadata: { title: '404 - Page introuvable', headings: [] } as never,
          } as never,
        ],
      },
    });

    const errorEntry = result.manifest.pages.find((page) => page.url === errorPage);
    expect(errorEntry?.status).toBe('soft-error-page');
    // The URL stays inventoried and disclosed, but never joins the
    // content-checked population.
    expect(errorEntry?.analysisCoverage).toBeUndefined();

    const homeEntry = result.manifest.pages.find((page) => page.url === home);
    expect(homeEntry?.status).toBe('visited');
    expect(homeEntry?.analysisCoverage).toBeDefined();
  });
});

// Issue #79 (Le Grand Chalet, real audit d9d9ec5e-ed0d-471e-9721-c2e4d979cc06):
// the brand detector proposed an SEO location phrase as the hotel's name.
// Two independent causes combined: the homepage voted twice in the title
// frequency count (once for its trailing-slash URL, once for the bare-host
// spelling the sitemap declares), and a length-based tiebreak favoured the
// shorter, wrong segment. og:title, which this site published correctly,
// was never consulted.
describe('writeAuditArtifacts characterization: issue #79 site-name detection', () => {
  const baseConfig = {
    maxPages: 4,
    maxDepth: 2,
    crawlDelayMs: 0,
    pageTimeoutMs: 30_000,
    lighthouseTimeoutMs: 60_000,
    userAgent: 'test',
    scanConcurrency: 2,
    sitemapMode: 'supplement',
  } as const;

  it('prefers a correct og:title over the hostile title-frequency winner', async () => {
    const hostileTitle =
      'Hôtel La Tremblade, quartier Ronce-les-Bains | Hôtel Le Grand Chalet en bord de mer avec vue mer';
    const result = await writeAuditArtifacts({
      auditId: 'audit-issue-79-og-title',
      kind: 'audit',
      browser: {} as never,
      startedAt: new Date('2026-09-06T10:00:00.000Z'),
      finishedAt: new Date('2026-09-06T10:01:00.000Z'),
      config: baseConfig,
      siteResult: {
        crawl: {
          startUrl: 'https://www.le-grand-chalet.fr/',
          pages: [
            { url: 'https://www.le-grand-chalet.fr/', depth: 0, status: 'visited' },
            { url: 'https://www.le-grand-chalet.fr', depth: 0, status: 'visited' },
            { url: 'https://www.le-grand-chalet.fr/galerie', depth: 1, status: 'visited' },
          ],
          effectiveDelayMs: 0,
          visitedCount: 3,
          maxPages: 4,
          maxDepth: 2,
          robotsTxtFound: false,
          robotsDisallowMatches: [],
          aiCrawlerBlocks: [],
          linkDiscoveredUrls: [],
        } as never,
        pages: [
          {
            url: 'https://www.le-grand-chalet.fr/',
            headMetadata: {
              title: hostileTitle,
              openGraphTags: { 'og:title': 'Hôtel Le Grand Chalet' },
              hreflangLinks: [],
            } as never,
          },
          // Sitemap-spelling duplicate of the same homepage: same title,
          // no og:title of its own (as a real duplicate page fetch would
          // return only the tags present in that particular HTML response
          // in this synthetic case, absent entirely).
          {
            url: 'https://www.le-grand-chalet.fr',
            headMetadata: { title: hostileTitle, openGraphTags: {}, hreflangLinks: [] } as never,
          },
          {
            url: 'https://www.le-grand-chalet.fr/galerie',
            headMetadata: { title: 'Galerie', openGraphTags: {}, hreflangLinks: [] } as never,
          },
        ],
      },
    });

    expect(result.manifest.siteSignals?.siteName).toBe('Hôtel Le Grand Chalet');
  });

  it('does not let a trailing-slash duplicate of the homepage manufacture a false brand-name match', async () => {
    const hostileTitle =
      'Hôtel La Tremblade, quartier Ronce-les-Bains | Hôtel Le Grand Chalet en bord de mer avec vue mer';
    const result = await writeAuditArtifacts({
      auditId: 'audit-issue-79-dedupe',
      kind: 'audit',
      browser: {} as never,
      startedAt: new Date('2026-09-06T10:00:00.000Z'),
      finishedAt: new Date('2026-09-06T10:01:00.000Z'),
      config: baseConfig,
      siteResult: {
        crawl: {
          startUrl: 'https://www.le-grand-chalet.fr/',
          pages: [
            { url: 'https://www.le-grand-chalet.fr/', depth: 0, status: 'visited' },
            { url: 'https://www.le-grand-chalet.fr', depth: 0, status: 'visited' },
            { url: 'https://www.le-grand-chalet.fr/galerie', depth: 1, status: 'visited' },
            { url: 'https://www.le-grand-chalet.fr/tarifs', depth: 1, status: 'visited' },
          ],
          effectiveDelayMs: 0,
          visitedCount: 4,
          maxPages: 4,
          maxDepth: 2,
          robotsTxtFound: false,
          robotsDisallowMatches: [],
          aiCrawlerBlocks: [],
          linkDiscoveredUrls: [],
        } as never,
        // No og:title or og:site_name published anywhere: the only signal
        // available is title frequency, and the homepage's two URL
        // spellings must not be allowed to out-vote a genuine per-page
        // heuristic result on their own.
        pages: [
          {
            url: 'https://www.le-grand-chalet.fr/',
            headMetadata: { title: hostileTitle, openGraphTags: {}, hreflangLinks: [] } as never,
          },
          {
            url: 'https://www.le-grand-chalet.fr',
            headMetadata: { title: hostileTitle, openGraphTags: {}, hreflangLinks: [] } as never,
          },
          {
            url: 'https://www.le-grand-chalet.fr/galerie',
            headMetadata: { title: 'Galerie', openGraphTags: {}, hreflangLinks: [] } as never,
          },
          {
            url: 'https://www.le-grand-chalet.fr/tarifs',
            headMetadata: { title: 'Tarifs', openGraphTags: {}, hreflangLinks: [] } as never,
          },
        ],
      },
    });

    expect(result.manifest.siteSignals?.siteName).not.toBe(
      'Hôtel La Tremblade, quartier Ronce-les-Bains',
    );
  });
});
