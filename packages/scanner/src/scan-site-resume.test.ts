import { describe, expect, it } from 'vitest';
import type { CrawledPage } from './crawl.js';
import type { PageAuditDecision } from './full-audit-plan.js';
import type { PageScanResult } from './scan-page.js';
import { needsLighthouseRun, partitionPagesForResume } from './scan-site.js';

const crawledPage = (url: string): CrawledPage => ({
  url,
  depth: 1,
  status: 'visited',
  discoveryMethod: 'link',
});

const makeDecision = (url: string, selectedForLighthouse: boolean): PageAuditDecision => ({
  url,
  role: 'content',
  confidence: 'high',
  plannedPasses: selectedForLighthouse
    ? ['rendered', 'axe', 'extended', 'lighthouse']
    : ['rendered', 'axe', 'extended'],
  reasonCodes: ['content-json-ld'],
});

const scanJson = (overrides: Partial<PageScanResult>): PageScanResult => ({
  url: 'https://example.com/a',
  renderedCostProfile: {
    url: 'https://example.com/a',
    domNodeCount: 10,
    imageCount: 0,
    resourceCount: 2,
    knownTransferBytes: 100,
    unknownTransferSizeCount: 0,
  },
  ...overrides,
});

describe('partitionPagesForResume', () => {
  const home = crawledPage('https://example.com/');
  const about = crawledPage('https://example.com/a');
  const stale = crawledPage('https://example.com/pre-035');
  const contact = crawledPage('https://example.com/contact');
  const pagesToScan = [home, about, stale, contact];

  const readExisting = (url: string): PageScanResult | undefined => {
    if (url === home.url) return scanJson({ url });
    if (url === about.url)
      return scanJson({
        url,
        lighthouse: { finalUrl: url } as NonNullable<PageScanResult['lighthouse']>,
      });
    if (url === stale.url) {
      // A pre-plan-035 artifact: a scan.json with no persisted cost profile.
      const { renderedCostProfile: _profile, ...withoutProfile } = scanJson({ url });
      return withoutProfile;
    }
    return undefined;
  };

  it('treats a page whose scan.json carries a rendered cost profile as completed', () => {
    const { completedByUrl } = partitionPagesForResume(pagesToScan, readExisting);

    expect(completedByUrl.get(home.url)).toBeDefined();
    expect(completedByUrl.get(home.url)?.renderedCostProfile).toBeDefined();
  });

  it('treats a completed page whose renderedCostProfile is missing as pending (pre-plan-035 artifact)', () => {
    const { completedByUrl, pending } = partitionPagesForResume(pagesToScan, readExisting);

    expect(completedByUrl.has(stale.url)).toBe(false);
    expect(pending.map((page) => page.url)).toContain(stale.url);
  });

  it('treats a page with no scan.json at all as pending', () => {
    const { completedByUrl, pending } = partitionPagesForResume(pagesToScan, readExisting);

    expect(completedByUrl.has(contact.url)).toBe(false);
    expect(pending.map((page) => page.url)).toContain(contact.url);
  });

  it('partitions the whole inventory into exactly completed plus pending', () => {
    const { completedByUrl, pending } = partitionPagesForResume(pagesToScan, readExisting);

    expect(completedByUrl.size).toBe(2);
    expect(pending).toHaveLength(2);
    expect([...completedByUrl.keys(), ...pending.map((page) => page.url)].sort()).toEqual(
      pagesToScan.map((page) => page.url).sort(),
    );
  });
});

describe('needsLighthouseRun', () => {
  const url = 'https://example.com/a';

  it('does not re-run Lighthouse for a selected page whose scan.json already records a result', () => {
    expect(
      needsLighthouseRun(
        makeDecision(url, true),
        scanJson({ url, lighthouse: { finalUrl: url } as never }),
      ),
    ).toBe(false);
  });

  it('does not re-run Lighthouse for a selected page whose scan.json records a lighthouseError', () => {
    expect(
      needsLighthouseRun(makeDecision(url, true), scanJson({ url, lighthouseError: 'timeout' })),
    ).toBe(false);
  });

  it('runs Lighthouse for a selected page whose scan.json carries neither record', () => {
    expect(needsLighthouseRun(makeDecision(url, true), scanJson({ url }))).toBe(true);
  });

  it('never runs Lighthouse for a page the plan did not select', () => {
    expect(needsLighthouseRun(makeDecision(url, false), scanJson({ url }))).toBe(false);
  });
});
