import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuditManifest, CoreWebVitals } from '@odysseus/core';
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
