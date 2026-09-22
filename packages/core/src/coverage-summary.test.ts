import { describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION } from './types/findings.js';
import {
  deriveCoverageLimitations,
  type AuditManifest,
  type PageAnalysisCoverage,
} from './types/manifest.js';
import { summarizeAuditCoverage } from './coverage-summary.js';

function coverage(overrides: Partial<PageAnalysisCoverage> = {}): PageAnalysisCoverage {
  return {
    plannerVersion: 'v1',
    role: 'content',
    confidence: 'high',
    reasonCodes: ['content-json-ld'],
    passes: {
      rendered: { outcome: 'completed' },
      axe: { outcome: 'completed' },
      extended: { outcome: 'completed' },
      lighthouse: { outcome: 'not-planned' },
    },
    ...overrides,
  };
}

function manifest(overrides: Partial<AuditManifest> = {}): AuditManifest {
  return {
    auditId: 'coverage-test',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-09-02T10:00:00.000Z',
    finishedAt: '2026-09-02T10:05:00.000Z',
    tool: {
      odysseusVersion: 'test',
      findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
      axeCoreVersion: '4.0.0',
      lighthouseVersion: '12.0.0',
      playwrightVersion: '1.0.0',
      chromiumVersion: '1.0.0',
    },
    config: {
      maxPages: 20,
      maxDepth: 5,
      crawlDelayMs: 0,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'test',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: 1,
      maxPages: 20,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 0,
    },
    pages: [],
    ...overrides,
  };
}

describe('summarizeAuditCoverage', () => {
  it('persists blocked and failed candidate counts for site-wide absence rules', () => {
    expect(
      deriveCoverageLimitations([
        { url: 'https://example.com/blocked', status: 'blocked' },
        { url: 'https://example.com/failed', status: 'http-error-status', httpStatus: 503 },
        { url: 'https://example.com/ok', status: 'visited' },
      ]),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'hreflang-missing',
          blockedCandidateCount: 1,
          failedCandidateCount: 1,
          candidateUrls: ['https://example.com/blocked', 'https://example.com/failed'],
        }),
      ]),
    );
  });

  it('does not treat redirects, real 404s, soft errors or off-site stubs as coverage gaps', () => {
    expect(
      deriveCoverageLimitations([
        { url: 'https://example.com/', status: 'visited', depth: 0 },
        { url: 'https://example.com/room/deluxe', status: 'redirect-interstitial', depth: 1 },
        { url: 'https://example.com/mentions-legales', status: 'redirect-interstitial', depth: 1 },
        { url: 'https://example.com/old', status: 'http-error-status', httpStatus: 404, depth: 1 },
        { url: 'https://example.com/erreur', status: 'soft-error-page', depth: 1 },
        { url: 'https://example.com/book', status: 'skipped-external-redirect', depth: 1 },
        { url: 'https://example.com/en', status: 'discovered-not-scanned', depth: 1 },
      ]),
    ).toEqual([]);
  });

  it('limits a page-scoped absence rule only when a page of its kind was not seen', () => {
    const limitations = deriveCoverageLimitations([
      { url: 'https://example.com/', status: 'visited', depth: 0 },
      { url: 'https://example.com/politique-de-confidentialite', status: 'blocked', depth: 1 },
      { url: 'https://example.com/chambres', status: 'blocked', depth: 1 },
    ]);
    const ruleIds = limitations.map((limitation) => limitation.ruleId);
    expect(ruleIds).toEqual(
      expect.arrayContaining([
        'lcen-mentions-legales-missing',
        'consent-mechanism-absent',
        'hreflang-missing',
        'structured-data-entity-missing',
        'sitemap-orphan-page',
      ]),
    );
    expect(ruleIds).not.toContain('accessibility-statement-missing');
    expect(ruleIds).not.toContain('llms-txt-missing');
    expect(
      limitations.find((limitation) => limitation.ruleId === 'lcen-mentions-legales-missing'),
    ).toEqual(
      expect.objectContaining({
        blockedCandidateCount: 1,
        candidateUrls: ['https://example.com/politique-de-confidentialite'],
      }),
    );
  });

  it('limits every page-scoped absence rule when the homepage was not seen', () => {
    const ruleIds = deriveCoverageLimitations(
      [{ url: 'https://example.com/fr', status: 'blocked', depth: 1 }],
      { homepageUrl: 'https://example.com/fr' },
    ).map((limitation) => limitation.ruleId);
    expect(ruleIds).toEqual(
      expect.arrayContaining([
        'accessibility-statement-missing',
        'lcen-mentions-legales-missing',
        'consent-mechanism-absent',
      ]),
    );
    expect(ruleIds).not.toContain('llms-txt-missing');
  });

  it('re-derives limitations instead of trusting a persisted copy', () => {
    const summary = summarizeAuditCoverage(
      manifest({
        pages: [
          {
            url: 'https://example.com/room',
            depth: 1,
            status: 'redirect-interstitial',
            errors: {},
          },
        ],
        coverageLimitations: [
          {
            ruleId: 'accessibility-statement-missing',
            blockedCandidateCount: 0,
            failedCandidateCount: 1,
            candidateUrls: ['https://example.com/room'],
          },
        ],
      }),
    );
    expect(summary.coverageLimitations).toBeUndefined();
  });

  it('reports current pass outcomes, inventory-only reasons, families, and guarded omissions', () => {
    const summary = summarizeAuditCoverage(
      manifest({
        pages: [
          {
            url: 'https://example.com/',
            depth: 0,
            status: 'visited',
            analysisCoverage: coverage({
              templateFamilyId: 'family-a',
              passes: {
                rendered: { outcome: 'completed' },
                axe: { outcome: 'completed' },
                extended: { outcome: 'partial', failedCheckIds: ['reflow'] },
                lighthouse: { outcome: 'completed' },
              },
            }),
            errors: {},
          },
          {
            url: 'https://example.com/article',
            depth: 1,
            status: 'visited',
            analysisCoverage: coverage({ templateFamilyId: 'family-a' }),
            errors: {},
          },
          {
            url: 'https://example.com/blocked',
            depth: 1,
            status: 'skipped-robots',
            errors: {},
          },
        ],
        continuationGuardSummary: {
          guardVersion: 'v1',
          familyMaxEnqueued: 60,
          families: [
            {
              familyKey: 'path:/page/{n}/',
              basis: 'numbered-pagination-control',
              enqueuedCount: 60,
              omittedCount: 4,
              omittedExampleUrls: ['https://example.com/page/61/'],
            },
          ],
          additionalFamiliesOmittedCount: 0,
          totalOmittedUrlCount: 4,
        },
      }),
    );

    const robotsGap = {
      blockedCandidateCount: 1,
      failedCandidateCount: 0,
      candidateUrls: ['https://example.com/blocked'],
    };
    expect(summary).toEqual({
      kind: 'current',
      inventoriedUrlCount: 3,
      coverageLimitations: [
        { ruleId: 'hreflang-missing', ...robotsGap },
        { ruleId: 'structured-data-entity-missing', ...robotsGap },
        { ruleId: 'sitemap-orphan-page', ...robotsGap },
      ],
      content: { completed: 1, partial: 1, failed: 0 },
      passes: {
        rendered: { completed: 2, partial: 0, failed: 0, notPlanned: 0 },
        axe: { completed: 2, partial: 0, failed: 0, notPlanned: 0 },
        extended: { completed: 1, partial: 1, failed: 0, notPlanned: 0 },
        lighthouse: { completed: 1, partial: 0, failed: 0, notPlanned: 1 },
      },
      pagesWithoutContentAnalysis: { 'skipped-robots': 1 },
      templateFamilyCount: 1,
      noindexPageCount: 0,
      continuationOmittedUrlCount: 4,
    });
  });

  // Issue #85: a redirect-interstitial page carries no analysisCoverage,
  // the same as every other non-'visited' status, so it must land in
  // pagesWithoutContentAnalysis under its own reason and never count as
  // content, with no special-cased branch for the new status.
  it('excludes a redirect-interstitial page from the content-checked population', () => {
    const summary = summarizeAuditCoverage(
      manifest({
        pages: [
          {
            url: 'https://example.com/',
            depth: 0,
            status: 'visited',
            analysisCoverage: coverage({ templateFamilyId: 'family-a' }),
            errors: {},
          },
          {
            url: 'https://example.com/fr',
            depth: 1,
            status: 'redirect-interstitial',
            redirectTargetUrl: 'https://example.com/',
            errors: {},
          },
        ],
      }),
    );

    expect(summary.kind).toBe('current');
    if (summary.kind !== 'current') throw new Error('expected current');
    expect(summary.inventoriedUrlCount).toBe(2);
    expect(summary.content).toEqual({ completed: 1, partial: 0, failed: 0 });
    expect(summary.pagesWithoutContentAnalysis).toEqual({ 'redirect-interstitial': 1 });
  });

  it('keeps historical manifests explicit instead of inventing pass counts', () => {
    expect(
      summarizeAuditCoverage(
        manifest({
          pages: [{ url: 'https://example.com/', depth: 0, status: 'visited', errors: {} }],
        }),
      ),
    ).toEqual({
      kind: 'legacy-unknown',
      inventoriedUrlCount: 1,
      continuationOmittedUrlCount: 0,
    });
  });

  it('treats a page with no usable content pass as failed and records missing current coverage', () => {
    const summary = summarizeAuditCoverage(
      manifest({
        pages: [
          {
            url: 'https://example.com/',
            depth: 0,
            status: 'visited',
            analysisCoverage: coverage({
              passes: {
                rendered: { outcome: 'failed', failedCheckIds: ['render-diff'] },
                axe: { outcome: 'failed', failedCheckIds: ['axe'] },
                extended: { outcome: 'failed' },
                lighthouse: { outcome: 'failed', failedCheckIds: ['lighthouse'] },
              },
            }),
            errors: {},
          },
          {
            url: 'https://example.com/missing',
            depth: 1,
            status: 'visited',
            errors: {},
          },
        ],
      }),
    );

    expect(summary.kind).toBe('current');
    if (summary.kind !== 'current') return;
    expect(summary.content).toEqual({ completed: 0, partial: 0, failed: 1 });
    expect(summary.pagesWithoutContentAnalysis).toEqual({ 'coverage-missing': 1 });
    expect(summary.passes.lighthouse.failed).toBe(1);
  });
});
