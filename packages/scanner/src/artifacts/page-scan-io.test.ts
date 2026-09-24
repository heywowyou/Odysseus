import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeAudit } from '@odysseus/core';
import {
  CHECK_SCOPE_REGISTRY,
  type CheckExecutionOutcome,
  type CheckId,
} from '../check-scope-coverage.js';
import type { RenderedCostProfile } from '../full-audit-plan.js';
import type { PageScanResult } from '../scan-page.js';
import { buildPageDir } from './paths.js';
import {
  buildScanJson,
  compactScanJson,
  readPageScanJson,
  writePageScanJson,
} from './page-scan-io.js';

const checkOutcomes: Partial<Record<CheckId, CheckExecutionOutcome>> = {
  'render-diff': 'completed',
  axe: 'completed',
  'keyboard-navigation': 'failed',
};

const renderedCostProfile: RenderedCostProfile = {
  url: 'https://example.com/',
  domNodeCount: 120,
  imageCount: 3,
  resourceCount: 14,
  knownTransferBytes: 40_000,
  unknownTransferSizeCount: 1,
};

describe('buildScanJson', () => {
  it('persists checkOutcomes and renderedCostProfile so a resume can replay the planner from disk', () => {
    const scanResult: PageScanResult = {
      url: 'https://example.com/',
      checkOutcomes,
      renderedCostProfile,
    };

    expect(buildScanJson(scanResult, undefined)).toEqual({
      url: 'https://example.com/',
      scanJsonVersion: 2,
      checkOutcomes,
      renderedCostProfile,
    });
  });

  it('omits both plan-035 fields when the scan result carries none', () => {
    const scanResult: PageScanResult = { url: 'https://example.com/' };
    const scanJson = buildScanJson(scanResult, undefined);

    expect(scanJson).not.toHaveProperty('checkOutcomes');
    expect(scanJson).not.toHaveProperty('renderedCostProfile');
    expect(scanJson.scanJsonVersion).toBe(2);
  });

  it('trims unused axe and Lighthouse screenshot data without changing normalized findings', () => {
    const url = 'https://example.com/';
    const scanResult = {
      url,
      axe: {
        violations: [
          {
            id: 'image-alt',
            impact: 'serious',
            tags: ['wcag2a', 'wcag111'],
            help: 'Images must have alternative text',
            description: 'Ensures images have alternative text',
            helpUrl: 'https://example.com/rule',
            nodes: [{ html: '<img src="a.jpg">', target: ['img'] }],
          },
        ],
        incomplete: [],
        passes: Array.from({ length: 500 }, () => ({
          id: 'pass',
          nodes: [{ html: 'x'.repeat(100) }],
        })),
        inapplicable: Array.from({ length: 500 }, () => ({
          id: 'unused',
          nodes: [{ html: 'x'.repeat(100) }],
        })),
      },
      lighthouse: {
        categories: {
          performance: { score: 0.3, auditRefs: [{ id: 'largest-contentful-paint', weight: 25 }] },
          seo: { score: 0.9, auditRefs: [] },
          accessibility: { score: 1, auditRefs: [] },
          'best-practices': { score: 1, auditRefs: [] },
        },
        audits: {
          'largest-contentful-paint': {
            score: 0.3,
            scoreDisplayMode: 'numeric',
            title: 'Largest Contentful Paint',
            description: 'LCP is too slow.',
            numericValue: 3200,
            displayValue: '3.2 s',
          },
          'screenshot-thumbnails': {
            score: null,
            scoreDisplayMode: 'informative',
            title: 'Filmstrip',
            description: '',
            details: { type: 'filmstrip', items: [{ data: 'x'.repeat(100_000) }] },
          },
          'final-screenshot': {
            score: null,
            scoreDisplayMode: 'informative',
            title: 'Final screenshot',
            description: '',
            details: { type: 'screenshot', data: 'x'.repeat(100_000) },
          },
        },
      },
    } as unknown as PageScanResult;
    const scanJson = buildScanJson(scanResult, undefined);
    const normalize = (page: PageScanResult) =>
      normalizeAudit({
        auditId: 'audit-1',
        startedAt: new Date('2026-09-24T00:00:00Z'),
        pages: [
          {
            url: page.url,
            ...(page.axe !== undefined ? { axe: page.axe } : {}),
            ...(page.lighthouse !== undefined ? { lighthouse: page.lighthouse } : {}),
          },
        ],
      });

    expect(scanJson.axe).not.toHaveProperty('passes');
    expect(scanJson.axe).not.toHaveProperty('inapplicable');
    expect(scanJson.lighthouse?.audits).not.toHaveProperty('screenshot-thumbnails');
    expect(scanJson.lighthouse?.audits).not.toHaveProperty('final-screenshot');
    expect(JSON.stringify(scanJson).length).toBeLessThan(JSON.stringify(scanResult).length);
    expect(normalize(scanJson)).toEqual(normalize(scanResult));
  });

  it('leaves every other field unchanged, including a Lighthouse result merged after the fact', () => {
    const scanResult: PageScanResult = {
      url: 'https://example.com/',
      checkOutcomes,
      lighthouse: { finalUrl: 'https://example.com/' } as NonNullable<PageScanResult['lighthouse']>,
    };
    const scanJson = buildScanJson(scanResult, undefined);

    expect(scanJson.lighthouse).toEqual(scanResult.lighthouse);
    expect(scanJson.checkOutcomes).toEqual(checkOutcomes);
    expect(scanJson).not.toHaveProperty('renderedCostProfile');
  });
});

describe('compactScanJson', () => {
  const legacyScan = {
    url: 'https://example.com/',
    roleContact: { email: 'contact@example.com' },
    axe: {
      testEngine: { name: 'axe-core', version: '4.10.0' },
      testEnvironment: { userAgent: 'x' },
      violations: [],
      incomplete: [],
      passes: [{ id: 'pass', nodes: [] }],
      inapplicable: [{ id: 'unused', nodes: [] }],
    },
    lighthouse: {
      finalUrl: 'https://example.com/',
      fullPageScreenshot: { screenshot: { data: 'x'.repeat(1_000) }, nodes: {} },
      audits: {
        'largest-contentful-paint': { score: 0.3 },
        'final-screenshot': { details: { data: 'x'.repeat(1_000) } },
      },
    },
  } as unknown as PageScanResult;

  it('drops the full-page Lighthouse screenshot', () => {
    expect(compactScanJson(legacyScan).lighthouse).not.toHaveProperty('fullPageScreenshot');
  });

  it('upgrades a legacy scan to the current version and keeps fields the trim does not own', () => {
    const compacted = compactScanJson(legacyScan);

    expect(compacted.scanJsonVersion).toBe(2);
    expect(compacted.roleContact).toEqual(legacyScan.roleContact);
    expect(compacted.lighthouse?.finalUrl).toBe('https://example.com/');
    expect(compacted.lighthouse?.audits).toEqual({
      'largest-contentful-paint': { score: 0.3 },
    });
    expect(compacted.axe).toEqual({
      testEngine: { name: 'axe-core', version: '4.10.0' },
      violations: [],
      incomplete: [],
    });
  });

  it('changes nothing the second time', () => {
    const once = compactScanJson(legacyScan);

    expect(JSON.stringify(compactScanJson(once))).toBe(JSON.stringify(once));
  });
});

let writtenTempDirs: string[] = [];

async function makeTempPagesDir(): Promise<{ auditDir: string; pagesDir: string }> {
  const auditDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'odysseus-page-scan-io-'));
  writtenTempDirs.push(auditDir);
  return { auditDir, pagesDir: path.join(auditDir, 'pages') };
}

afterEach(async () => {
  await Promise.all(
    writtenTempDirs.map((dir) => fs.promises.rm(dir, { recursive: true, force: true })),
  );
  writtenTempDirs = [];
});

describe('writePageScanJson and readPageScanJson', () => {
  it('round trips a written scan.json through readPageScanJson', async () => {
    const { auditDir, pagesDir } = await makeTempPagesDir();
    const scanResult: PageScanResult = { url: 'https://example.com/', renderDiffError: 'gone' };

    const { scanJson } = writePageScanJson(pagesDir, auditDir, scanResult);

    expect(readPageScanJson(pagesDir, scanResult.url)).toEqual(scanJson);
  });

  it('writes atomically, leaving no temp file behind', async () => {
    const { auditDir, pagesDir } = await makeTempPagesDir();

    writePageScanJson(pagesDir, auditDir, { url: 'https://example.com/' });

    const pageDirPath = path.join(pagesDir, buildPageDir('https://example.com/'));
    expect(fs.readdirSync(pageDirPath)).toEqual(['scan.json']);
  });

  // Issue #132: one scan.json truncated by a crash mid-write must not
  // throw out of the resume partition and poison every later resume
  // attempt of the audit; it degrades to that page pending a re-scan.
  it('reads a truncated file as undefined instead of throwing', async () => {
    const { auditDir, pagesDir } = await makeTempPagesDir();
    writePageScanJson(pagesDir, auditDir, { url: 'https://example.com/' });
    fs.writeFileSync(
      path.join(pagesDir, buildPageDir('https://example.com/'), 'scan.json'),
      '{ truncated',
    );

    expect(readPageScanJson(pagesDir, 'https://example.com/')).toBeUndefined();
  });

  it('reads a missing file as undefined', async () => {
    const { pagesDir } = await makeTempPagesDir();

    expect(readPageScanJson(pagesDir, 'https://example.com/')).toBeUndefined();
  });
});

describe('buildScanJson error fields', () => {
  it('keeps every registered check error field, so a persisted failure still says why', () => {
    // The attempt ledger classifies a failed check from this text; a field
    // dropped here leaves a stored page whose failure cannot be explained or
    // reclassified later.
    const errorFields = CHECK_SCOPE_REGISTRY.flatMap((entry) =>
      entry.errorField === undefined ? [] : [entry.errorField],
    );
    const scanResult = Object.fromEntries([
      ['url', 'https://example.com/'],
      ...errorFields.map((field) => [field, `${field} message`]),
    ]) as unknown as PageScanResult;

    const scanJson = buildScanJson(scanResult, undefined) as unknown as Record<string, unknown>;

    for (const field of errorFields) {
      expect(scanJson[field], field).toBe(`${field} message`);
    }
  });
});
