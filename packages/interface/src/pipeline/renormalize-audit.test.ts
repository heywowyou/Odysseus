import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuditManifest, CoreWebVitals, PageAnalysisCoverage } from '@odysseus/core';
import { renormalizeAudit } from './renormalize-audit.js';

const FIXTURE_MANIFEST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../fixtures/test-audits/small-site/manifest.json',
);

const measurement = (numericValue: number) => ({ score: 0.5, numericValue, displayValue: '' });
const STALE_VITALS: CoreWebVitals = {
  lcp: measurement(27_000),
  cls: measurement(0),
  tbt: measurement(0),
  fcp: measurement(0),
  speedIndex: measurement(0),
};

function lighthouse(finalDisplayedUrl: string, lcpMs: number): Record<string, unknown> {
  return {
    finalDisplayedUrl,
    categories: { performance: { score: 0.5, auditRefs: [] } },
    audits: {
      'largest-contentful-paint': {
        score: 0.5,
        scoreDisplayMode: 'numeric',
        numericValue: lcpMs,
        displayValue: '',
        title: 'LCP',
        description: '',
      },
    },
  };
}

let auditDir: string;
beforeEach(async () => {
  auditDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-renormalize-'));
});
afterEach(async () => {
  await fs.rm(auditDir, { recursive: true, force: true });
});

async function writePage(dir: string, scan: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.join(auditDir, 'pages', dir), { recursive: true });
  await fs.writeFile(path.join(auditDir, 'pages', dir, 'scan.json'), JSON.stringify(scan));
}

describe('renormalizeAudit lab metrics', () => {
  it('recomputes stored lab metrics so only runs that measured a content page remain', async () => {
    const fixture = JSON.parse(await fs.readFile(FIXTURE_MANIFEST, 'utf8')) as AuditManifest;
    const [home, book, challenge] = fixture.pages.slice(0, 3).map((page) => page.url) as [
      string,
      string,
      string,
    ];
    const manifest: AuditManifest = {
      ...fixture,
      pages: fixture.pages.slice(0, 3).map((page) => ({ ...page, coreWebVitals: STALE_VITALS })),
    };
    await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest));
    await writePage('home', { url: home, lighthouse: lighthouse(home, 2_000) });
    await writePage('book', {
      url: book,
      lighthouse: lighthouse('https://be.synxis.com/?hotel=1', 19_000),
    });
    await writePage('challenge', {
      url: challenge,
      headMetadata: { title: 'Test de sécurité' },
      lighthouse: lighthouse(challenge, 27_000),
    });

    const result = await renormalizeAudit(auditDir, undefined);
    const byUrl = new Map(result.manifest.pages.map((page) => [page.url, page]));

    expect(byUrl.get(home)?.coreWebVitals?.lcp?.numericValue).toBe(2_000);
    expect(byUrl.get(book)?.coreWebVitals).toBeUndefined();
    // A doorway to a booking engine is a redirect, not an analysed page.
    expect(byUrl.get(book)?.status).toBe('redirect-interstitial');
    expect(byUrl.get(book)?.redirectTargetUrl).toBe('https://be.synxis.com/?hotel=1');
    expect(byUrl.get(home)?.status).toBe('visited');
    expect(byUrl.get(challenge)?.coreWebVitals).toBeUndefined();
  });
});

describe('renormalizeAudit page population', () => {
  it('reads only the pages the manifest lists, not every leftover scan folder', async () => {
    const fixture = JSON.parse(await fs.readFile(FIXTURE_MANIFEST, 'utf8')) as AuditManifest;
    const home = fixture.pages[0]!.url;
    const leftover = new URL('/2023/07/03', home).toString();
    const manifest: AuditManifest = { ...fixture, pages: [fixture.pages[0]!] };
    await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest));
    await writePage('home', { url: home, lighthouse: lighthouse(home, 2_000) });
    await writePage('leftover', { url: leftover, lighthouse: lighthouse(leftover, 30_000) });

    const result = await renormalizeAudit(auditDir, undefined);

    expect(result.pageCount).toBe(1);
    const findings = JSON.parse(
      await fs.readFile(path.join(auditDir, 'findings.json'), 'utf8'),
    ) as { pageUrls: string[] }[];
    expect(findings.flatMap((finding) => finding.pageUrls)).not.toContain(leftover);
  });
});

// Plan 075 I1, on the stored grandhoteldesalpes shape: WPML sent our French
// browser from each English page to its French translation, whose hreflang
// lists the English page. A refresh re-marks it and the sitemap stops
// counting it as a redirect; a genuine slug rename stays one.
describe('renormalizeAudit language redirects', () => {
  it('re-marks a translation redirect and keeps it out of the sitemap redirect count', async () => {
    const fixture = JSON.parse(await fs.readFile(FIXTURE_MANIFEST, 'utf8')) as AuditManifest;
    const home = fixture.pages[0]!;
    const english = new URL('/en/legal-notices/', home.url).toString();
    const renamed = new URL('/fr/chambres/', home.url).toString();
    const { analysisCoverage: _coverage, ...homeWithoutCoverage } = home;
    const redirectTo = (url: string, pageDir: string): AuditManifest['pages'][number] => ({
      ...homeWithoutCoverage,
      url,
      pageDir,
      status: 'redirect-interstitial',
      redirectTargetUrl: home.url,
    });
    const manifest: AuditManifest = {
      ...fixture,
      pages: [home, redirectTo(english, 'pages/en'), redirectTo(renamed, 'pages/renamed')],
    };
    await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest));
    await writePage(path.basename(home.pageDir ?? 'home'), {
      url: home.url,
      headMetadata: {
        pageUrl: home.url,
        title: 'Accueil',
        metaDescription: null,
        canonicalUrls: [],
        openGraphTags: {},
        jsonLdBlocks: [],
        headings: [],
        hreflangLinks: [{ href: english, lang: 'en' }],
        languageSwitcherLinks: [],
        robotsMeta: null,
        googlebotMeta: null,
        htmlLang: 'fr',
        xRobotsTag: null,
        anchors: [],
      },
      sitemapCheck: {
        pageUrl: home.url,
        found: true,
        isSitemapIndex: false,
        sitemapUrl: new URL('/sitemap.xml', home.url).toString(),
        pageEntries: [{ url: home.url }, { url: english }, { url: renamed }],
        redirectedUrls: [],
        crawledUrls: [home.url],
        discoveredUrls: [home.url, english, renamed],
      },
    });
    const landedOnHome = (url: string) => ({
      url,
      renderDiff: {
        pageUrl: url,
        rawTextLength: 2000,
        renderedTextLength: 2000,
        missingPercent: 0,
        consoleErrors: [],
        httpStatus: 200,
        renderedHttpStatus: 200,
        renderedLandedUrl: home.url,
      },
    });
    await writePage('en', landedOnHome(english));
    await writePage('renamed', landedOnHome(renamed));

    await renormalizeAudit(auditDir, undefined);

    const stored = JSON.parse(
      await fs.readFile(path.join(auditDir, 'manifest.json'), 'utf8'),
    ) as AuditManifest;
    const statusOf = (url: string) => stored.pages.find((page) => page.url === url)?.status;
    expect(statusOf(english)).toBe('language-redirect');
    expect(statusOf(renamed)).toBe('redirect-interstitial');
    const findings = JSON.parse(
      await fs.readFile(path.join(auditDir, 'findings.json'), 'utf8'),
    ) as { ruleId: string; description: string }[];
    const redirects = findings.find((finding) => finding.ruleId === 'sitemap-lists-redirects');
    expect(redirects?.description).toContain('1 redirected URL(s)');
  });
});

// Issue #565: a refresh re-decides every stored scanned page with the scan's
// own verdict, so a stricter soft-404 rule reaches stored audits.
describe('renormalizeAudit page verdict', () => {
  const renderedAt = (url: string, title: string) => ({
    pageUrl: url,
    rawTextLength: 800,
    renderedTextLength: 760,
    missingPercent: 0,
    consoleErrors: [],
    httpStatus: 200,
    renderedHttpStatus: 200,
    renderedLandedUrl: url,
    renderedTitle: title,
    renderedInterstitialMarkers: [],
  });

  it('brings back a stored soft 404 whose title-only evidence no longer qualifies', async () => {
    const fixture = JSON.parse(await fs.readFile(FIXTURE_MANIFEST, 'utf8')) as AuditManifest;
    const home = fixture.pages[0]!;
    // aflatta's gift voucher: titled « Page introuvable », no heading at all.
    const voucher = new URL('/detail-produit/14', home.url).toString();
    const coverage: PageAnalysisCoverage = {
      plannerVersion: 'v3',
      role: 'transactional',
      confidence: 'high',
      reasonCodes: [],
      passes: {
        rendered: { outcome: 'completed' },
        axe: { outcome: 'completed' },
        extended: { outcome: 'completed' },
        lighthouse: { outcome: 'not-planned' },
      },
    };
    const manifest: AuditManifest = {
      ...fixture,
      pages: [
        home,
        {
          ...home,
          url: voucher,
          pageDir: 'pages/voucher',
          depth: 1,
          status: 'soft-error-page',
          setAsideAnalysisCoverage: coverage,
        },
      ],
    };
    await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest));
    await writePage('home', { url: home.url, renderDiff: renderedAt(home.url, 'Accueil') });
    await writePage('voucher', {
      url: voucher,
      renderDiff: renderedAt(voucher, 'Page introuvable'),
      headMetadata: {
        pageUrl: voucher,
        title: 'Page introuvable',
        metaDescription: null,
        canonicalUrls: [],
        openGraphTags: {},
        jsonLdBlocks: [],
        headings: [],
        hreflangLinks: [],
        languageSwitcherLinks: [],
        robotsMeta: null,
        googlebotMeta: null,
        htmlLang: 'fr',
        xRobotsTag: null,
        anchors: [],
      },
    });

    const result = await renormalizeAudit(auditDir, undefined);
    const stored = result.manifest.pages.find((page) => page.url === voucher);

    expect(stored?.status).toBe('visited');
    expect(stored?.analysisCoverage).toEqual(coverage);
    expect(stored?.setAsideAnalysisCoverage).toBeUndefined();
  });

  // Plan 075 M7, yonahotel.com: a stale path lands on the site's catch-all.
  it("sets aside a page whose raw document is the site's catch-all answer", async () => {
    const fixture = JSON.parse(await fs.readFile(FIXTURE_MANIFEST, 'utf8')) as AuditManifest;
    const home = fixture.pages[0]!;
    const stale = new URL('/en/hotel/accueil', home.url).toString();
    const probeUrl = new URL('/en/odysseus-missing-page-3f9a2c', home.url).toString();
    const raw = (textSignature: string) => ({
      markupLength: 240_000,
      visibleTextLength: 937,
      textSignature,
      interstitialMarkers: [],
    });
    const manifest: AuditManifest = {
      ...fixture,
      crawl: {
        ...fixture.crawl,
        catchAllProbes: [
          {
            url: probeUrl,
            landedUrl: probeUrl,
            httpStatus: 200,
            textSignature: '73a58f695ec9d7de',
          },
        ],
      },
      pages: [home, { ...home, url: stale, pageDir: 'pages/stale', depth: 1 }],
    };
    await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest));
    await writePage('home', {
      url: home.url,
      renderDiff: { ...renderedAt(home.url, 'Accueil'), rawDocument: raw('6f5577b8add3399e') },
    });
    await writePage('stale', {
      url: stale,
      renderDiff: { ...renderedAt(stale, ''), rawDocument: raw('73a58f695ec9d7de') },
    });

    const result = await renormalizeAudit(auditDir, undefined);

    expect(result.manifest.pages.find((page) => page.url === stale)?.status).toBe(
      'soft-error-page',
    );
    expect(result.manifest.pages.find((page) => page.url === home.url)?.status).toBe('visited');
  });

  it('keeps the stored crawl-time status of a page without a scan.json', async () => {
    const fixture = JSON.parse(await fs.readFile(FIXTURE_MANIFEST, 'utf8')) as AuditManifest;
    const home = fixture.pages[0]!;
    const gone = new URL('/ancienne-page', home.url).toString();
    const manifest: AuditManifest = {
      ...fixture,
      pages: [
        home,
        { url: gone, depth: 1, status: 'http-error-status', httpStatus: 404, errors: {} },
      ],
    };
    await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest));
    await writePage('home', { url: home.url, renderDiff: renderedAt(home.url, 'Accueil') });

    const result = await renormalizeAudit(auditDir, undefined);
    const stored = result.manifest.pages.find((page) => page.url === gone);

    expect(stored).toMatchObject({ status: 'http-error-status', httpStatus: 404 });
  });
});
