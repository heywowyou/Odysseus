import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import {
  applyOccurrenceWeighting,
  enforceSiteWideAccessibilityFloor,
  logContainmentWarnings,
  SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD,
} from './structure-ranking.js';
import type { StructureThemeWithKey } from './structure-schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Real scan behind docs/report-v2-refactor.md A5/A6: f039 (meta-viewport,
 *  blocked zoom, WCAG 1.4.4) sits on 18 of 20 pages - the exact site-wide
 *  floor case - and f017/f037 (link-name on the sitemap, crawlable-anchors
 *  in the footer) are the 180- and 203-occurrence findings the v1 report
 *  buried at single-occurrence visual weight. */
function loadHaaitzaAuditDir(): string {
  return path.join(moduleDir, '../../../artifacts/haaitza.com/2026-08-06T20-30-06Z');
}

function loadHaaitzaManifest(): AuditManifest {
  return JSON.parse(readFileSync(path.join(loadHaaitzaAuditDir(), 'manifest.json'), 'utf-8')) as AuditManifest;
}

function loadHaaitzaFindings(): Finding[] {
  return JSON.parse(readFileSync(path.join(loadHaaitzaAuditDir(), 'findings.json'), 'utf-8')) as Finding[];
}

function findFinding(findings: Finding[], findingId: string): Finding {
  const finding = findings.find((f) => f.findingId === findingId);
  if (!finding) throw new Error(`fixture finding ${findingId} not found`);
  return finding;
}

function theme(
  themeKey: string,
  findingIds: string[],
  overrides: Partial<StructureThemeWithKey> = {},
): StructureThemeWithKey {
  return {
    themeKey,
    findingIds,
    category: 'accessibility',
    effort: 'medium',
    impact: 'medium',
    priorityRank: 1,
    ...overrides,
  };
}

describe('enforceSiteWideAccessibilityFloor', () => {
  it('bumps impact and promotes a bottom-quartile theme containing a site-wide WCAG finding', () => {
    const findings = loadHaaitzaFindings();
    const manifest = loadHaaitzaManifest();

    // f039 (meta-viewport, WCAG 1.4.4) is on 18/20 visited pages - above
    // SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD (80%).
    const siteWideFinding = findFinding(findings, 'f039');
    expect((siteWideFinding.pageUrls.length / 20) * 100).toBeGreaterThanOrEqual(
      SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD,
    );

    const themes: StructureThemeWithKey[] = [
      theme('t1', ['f002'], { priorityRank: 1, impact: 'high' }),
      theme('t2', ['f009'], { priorityRank: 2, impact: 'high' }),
      theme('t3', ['f086'], { priorityRank: 3, impact: 'low' }),
      // Last of 4 themes: bottom quartile (ceil(4 * 0.75) = 3, 0-indexed).
      theme('t4', ['f039'], { priorityRank: 4, impact: 'low' }),
    ];

    const result = enforceSiteWideAccessibilityFloor(themes, findings, manifest);

    const floorTheme = result.find((t) => t.themeKey === 't4');
    if (!floorTheme) throw new Error('expected t4 to survive');
    expect(floorTheme.impact).toBe('medium');
    expect(floorTheme.priorityRank).toBeLessThan(4);

    // Dense 1..N renumbering.
    expect(result.map((t) => t.priorityRank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('leaves a theme with no site-wide WCAG finding untouched', () => {
    const findings = loadHaaitzaFindings();
    const manifest = loadHaaitzaManifest();
    const themes: StructureThemeWithKey[] = [
      theme('t1', ['f002'], { priorityRank: 1, impact: 'high' }),
      theme('t2', ['f086'], { priorityRank: 2, impact: 'low' }),
    ];

    const result = enforceSiteWideAccessibilityFloor(themes, findings, manifest);

    expect(result.find((t) => t.themeKey === 't2')?.impact).toBe('low');
  });
});

describe('applyOccurrenceWeighting', () => {
  it('promotes a high-occurrence theme ranked low by the model above a single-occurrence theme ranked higher', () => {
    const findings = loadHaaitzaFindings();

    // f017: link-name, 180 occurrences on one page. f082: offscreen-images,
    // minor, low occurrence count - ranked ahead of f017 by the model here,
    // which is exactly the A6 failure mode.
    const themes: StructureThemeWithKey[] = [
      theme('t-low-volume', ['f082'], { priorityRank: 1, category: 'performance' }),
      theme('t-high-volume', ['f017'], { priorityRank: 2, category: 'accessibility' }),
    ];

    const result = applyOccurrenceWeighting(themes, findings);

    const highVolumeRank = result.find((t) => t.themeKey === 't-high-volume')?.priorityRank;
    const lowVolumeRank = result.find((t) => t.themeKey === 't-low-volume')?.priorityRank;
    expect(highVolumeRank).toBeLessThan(lowVolumeRank!);
  });

  it('is a no-op renumbering for a single theme', () => {
    const findings = loadHaaitzaFindings();
    const themes: StructureThemeWithKey[] = [theme('t1', ['f002'], { priorityRank: 5 })];

    const result = applyOccurrenceWeighting(themes, findings);

    expect(result).toEqual([{ ...themes[0], priorityRank: 1 }]);
  });
});

describe('logContainmentWarnings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when a theme resolves entirely to diverted (legal-page) findings', () => {
    const findings = loadHaaitzaFindings();
    const manifest = loadHaaitzaManifest();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // f013 (is-crawlable) is confined to the CGU/cookies/privacy pages -
    // entirely legal, entirely diverted per docs/report-v2-refactor.md A3.
    const themes: StructureThemeWithKey[] = [theme('t1', ['f013'], { category: 'seo' })];

    logContainmentWarnings(themes, findings, manifest);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/resolves entirely to diverted pages/);
  });

  it('does not warn for an ordinary theme', () => {
    const findings = loadHaaitzaFindings();
    const manifest = loadHaaitzaManifest();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const themes: StructureThemeWithKey[] = [theme('t1', ['f002'])];

    logContainmentWarnings(themes, findings, manifest);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
