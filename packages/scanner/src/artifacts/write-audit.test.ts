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
});
