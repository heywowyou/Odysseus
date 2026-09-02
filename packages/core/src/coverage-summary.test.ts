import { describe, expect, it } from 'vitest';
import { FINDINGS_SCHEMA_VERSION } from './types/findings.js';
import type { AuditManifest, PageAnalysisCoverage } from './types/manifest.js';
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

    expect(summary).toEqual({
      kind: 'current',
      inventoriedUrlCount: 3,
      content: { completed: 1, partial: 1, failed: 0 },
      passes: {
        rendered: { completed: 2, partial: 0, failed: 0, notPlanned: 0 },
        axe: { completed: 2, partial: 0, failed: 0, notPlanned: 0 },
        extended: { completed: 1, partial: 1, failed: 0, notPlanned: 0 },
        lighthouse: { completed: 1, partial: 0, failed: 0, notPlanned: 1 },
      },
      pagesWithoutContentAnalysis: { 'skipped-robots': 1 },
      templateFamilyCount: 1,
      continuationOmittedUrlCount: 4,
    });
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
