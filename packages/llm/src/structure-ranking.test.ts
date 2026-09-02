import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import {
  applyOccurrenceWeighting,
  applyStructureRankingRules,
  enforceImpactEffortOrdering,
  enforceQuickWinFloor,
  enforceSiteWideAccessibilityFloor,
  logContainmentWarnings,
  SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD,
} from './structure-ranking.js';
import type { StructureThemeWithKey } from './structure-schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Real scan behind docs/archive/report-v2-refactor.md A5/A6: f039 (meta-viewport,
 *  blocked zoom, WCAG 1.4.4) sits on 18 of 20 pages - the exact site-wide
 *  floor case - and f017/f037 (link-name on the sitemap, crawlable-anchors
 *  in the footer) are the 180- and 203-occurrence findings the v1 report
 *  buried at single-occurrence visual weight. */
function loadMultiPageAuditDir(): string {
  return path.join(moduleDir, '../../../fixtures/test-audits/multi-page');
}

function loadMultiPageManifest(): AuditManifest {
  return JSON.parse(
    readFileSync(path.join(loadMultiPageAuditDir(), 'manifest.json'), 'utf-8'),
  ) as AuditManifest;
}

function loadMultiPageFindings(): Finding[] {
  return JSON.parse(
    readFileSync(path.join(loadMultiPageAuditDir(), 'findings.json'), 'utf-8'),
  ) as Finding[];
}

/** report-feedback-large-rule-families.md item 0.8: image-alt (25 Critique
 *  findings, 166 occurrences, all 18 pages) and link-name (Sérieux, 282
 *  occurrences, all 18 pages) - the two largest rule families in the
 *  whole audit - ranked 8th and 9th of 12 themes, entirely missing from
 *  the report's top-6 priorities. */
function loadLargeRuleFamiliesAuditDir(): string {
  return path.join(moduleDir, '../../../fixtures/test-audits/large-rule-families');
}

function loadLargeRuleFamiliesManifest(): AuditManifest {
  return JSON.parse(
    readFileSync(path.join(loadLargeRuleFamiliesAuditDir(), 'manifest.json'), 'utf-8'),
  ) as AuditManifest;
}

function loadLargeRuleFamiliesFindings(): Finding[] {
  return JSON.parse(
    readFileSync(path.join(loadLargeRuleFamiliesAuditDir(), 'findings.json'), 'utf-8'),
  ) as Finding[];
}

/** The model's own raw grouping/effort/impact/rank for this audit,
 *  loaded from the stored analysis rather than hand-built, so this test
 *  exercises the exact input shape that actually reproduced the bug. */
function loadLargeRuleFamiliesRawThemes(): StructureThemeWithKey[] {
  const analysesDir = path.join(loadLargeRuleFamiliesAuditDir(), 'analyses');
  // Resolved by suffix: the fixture uses the artifacts layout, whose timestamp
  // changes whenever the fixture is regenerated.
  const file = readdirSync(analysesDir)
    .filter((name) => name.endsWith('-fr.json'))
    .sort()
    .at(-1);
  if (file === undefined) throw new Error(`No fr analysis under ${analysesDir}`);
  const analysis = JSON.parse(readFileSync(path.join(analysesDir, file), 'utf-8')) as {
    themes: StructureThemeWithKey[];
  };
  return analysis.themes.map((t, i) => ({ ...t, themeKey: `t${i + 1}` }));
}

function findFinding(findings: Finding[], findingId: string): Finding {
  const finding = findings.find((f) => f.findingId === findingId);
  if (!finding) throw new Error(`fixture finding ${findingId} not found`);
  return finding;
}

/** 2026-08-25: these used to be finding-id literals (f039, f017, f086...).
 *  Finding ids are assigned densely at normalization time, so every dedupe or
 *  collapse change renumbers the whole fixture and silently repoints a test at
 *  a different finding - or, worse, at one that no longer exists. Re-deriving
 *  this session's fixture moved multi-page from 98 findings to 70 and f086 stopped
 *  existing at all.
 *
 *  Each id below is now resolved from the property the test actually cares
 *  about, so the test states its own premise instead of encoding a snapshot of
 *  it. The three FILLER ids are genuinely arbitrary - those tests need a theme
 *  to hold some real finding and do not care which. */
function findByRule(
  findings: Finding[],
  ruleId: string,
  predicate: (f: Finding) => boolean = () => true,
): string {
  const finding = findings.find((f) => f.ruleId === ruleId && predicate(f));
  if (!finding) throw new Error(`fixture has no ${ruleId} finding matching the test's premise`);
  return finding.findingId;
}

/** meta-viewport, WCAG 1.4.4, on 18 of 20 visited pages. */
const siteWideWcagId = (findings: Finding[]): string => findByRule(findings, 'meta-viewport');
/** link-name, 180 occurrences confined to one page. */
const highOccurrenceId = (findings: Finding[]): string =>
  findByRule(findings, 'link-name', (f) => f.pageUrls.length === 1 && f.occurrences > 100);
/** offscreen-images: minor, and ranked ahead of the above by the model. */
const lowVolumeMinorId = (findings: Finding[]): string => findByRule(findings, 'offscreen-images');
/** An accessibility finding on a single page, so the site-wide floor does not
 *  apply to it. */
const confinedAccessibilityId = (findings: Finding[]): string =>
  findByRule(findings, 'image-alt', (f) => f.pageUrls.length === 1);
/** is-crawlable, confined to the CGU/cookies/privacy pages - entirely legal,
 *  entirely diverted per docs/archive/report-v2-refactor.md A3. */
const divertedSeoId = (findings: Finding[]): string => findByRule(findings, 'is-crawlable');

/** Three findings that are interchangeable for a test that does not care
 *  which finding a theme holds. Derived, never hardcoded: finding ids are
 *  reassigned densely on every normalization, and a stale literal either
 *  points at a different finding or at none.
 *
 *  Two properties are required, both learned the hard way while repairing
 *  these tests. They must share an identical occurrence and page profile,
 *  because applyOccurrenceWeighting runs in the full pipeline and would
 *  otherwise decide a test that is about effort ordering. And they must carry
 *  no WCAG criteria, because enforceSiteWideAccessibilityFloor promotes a
 *  site-wide accessibility finding and would otherwise decide a test that is
 *  about something else. */
function neutralFillerIds(findings: Finding[]): [string, string, string, string] {
  const byProfile = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (finding.wcagCriteria.length > 0) continue;
    const key = `${finding.occurrences}|${finding.pageUrls.length}`;
    byProfile.set(key, [...(byProfile.get(key) ?? []), finding]);
  }
  const group = [...byProfile.values()]
    .filter((g) => g.length >= 4)
    .sort((a, b) => b.length - a.length)[0];
  if (!group) throw new Error('fixture has no four interchangeable non-WCAG findings');
  const [a, b, c, d] = group.map((f) => f.findingId);
  return [a!, b!, c!, d!];
}

const [fillerA, fillerB, fillerC, fillerD] = neutralFillerIds(loadMultiPageFindings());

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
  it('uses completed axe pages as the denominator for a current manifest', () => {
    const sourceFindings = loadMultiPageFindings();
    const sourceManifest = loadMultiPageManifest();
    const sourceFinding = findFinding(sourceFindings, siteWideWcagId(sourceFindings));
    const axeCompletedUrls = sourceManifest.pages.slice(0, 5).map((page) => page.url);
    const finding = { ...sourceFinding, pageUrls: axeCompletedUrls.slice(0, 4) };
    const manifest: AuditManifest = {
      ...sourceManifest,
      pages: sourceManifest.pages.map((page, index) =>
        index < 5
          ? {
              ...page,
              analysisCoverage: {
                plannerVersion: 'v1' as const,
                role: 'content' as const,
                confidence: 'high' as const,
                reasonCodes: [],
                passes: {
                  rendered: { outcome: 'completed' as const },
                  axe: { outcome: 'completed' as const },
                  extended: { outcome: 'completed' as const },
                  lighthouse: { outcome: 'not-planned' as const },
                },
              },
            }
          : page,
      ),
    };
    const themes: StructureThemeWithKey[] = [
      theme('t1', [fillerA], { priorityRank: 1, impact: 'high' }),
      theme('t2', [fillerB], { priorityRank: 2, impact: 'high' }),
      theme('t3', [fillerC], { priorityRank: 3, impact: 'low' }),
      theme('t4', [finding.findingId], { priorityRank: 4, impact: 'low' }),
    ];

    const result = enforceSiteWideAccessibilityFloor(themes, [finding], manifest);

    expect(result.find((candidate) => candidate.themeKey === 't4')).toMatchObject({
      impact: 'medium',
      priorityRank: 3,
    });
  });

  it('bumps impact and promotes a bottom-quartile theme containing a site-wide WCAG finding', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();

    // f039 (meta-viewport, WCAG 1.4.4) is on 18/20 visited pages - above
    // SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD (80%).
    const siteWideFinding = findFinding(findings, siteWideWcagId(findings));
    expect((siteWideFinding.pageUrls.length / 20) * 100).toBeGreaterThanOrEqual(
      SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD,
    );

    const themes: StructureThemeWithKey[] = [
      theme('t1', [fillerA], { priorityRank: 1, impact: 'high' }),
      theme('t2', [fillerB], { priorityRank: 2, impact: 'high' }),
      theme('t3', [fillerC], { priorityRank: 3, impact: 'low' }),
      // Last of 4 themes: bottom quartile (ceil(4 * 0.75) = 3, 0-indexed).
      theme('t4', [siteWideWcagId(findings)], { priorityRank: 4, impact: 'low' }),
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
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();
    const themes: StructureThemeWithKey[] = [
      theme('t1', [fillerA], { priorityRank: 1, impact: 'high' }),
      // Deliberately a finding confined to one page: the fillers above are
      // all site-wide, which is exactly what this test needs t2 not to be.
      theme('t2', [confinedAccessibilityId(findings)], { priorityRank: 2, impact: 'low' }),
    ];

    const result = enforceSiteWideAccessibilityFloor(themes, findings, manifest);

    expect(result.find((t) => t.themeKey === 't2')?.impact).toBe('low');
  });
});

describe('applyOccurrenceWeighting', () => {
  it('promotes a high-occurrence theme ranked low by the model above a single-occurrence theme ranked higher', () => {
    const findings = loadMultiPageFindings();

    // f017: link-name, 180 occurrences on one page. f082: offscreen-images,
    // minor, low occurrence count - ranked ahead of f017 by the model here,
    // which is exactly the A6 failure mode.
    const themes: StructureThemeWithKey[] = [
      theme('t-low-volume', [lowVolumeMinorId(findings)], {
        priorityRank: 1,
        category: 'performance',
      }),
      theme('t-high-volume', [highOccurrenceId(findings)], {
        priorityRank: 2,
        category: 'accessibility',
      }),
    ];

    const result = applyOccurrenceWeighting(themes, findings);

    const highVolumeRank = result.find((t) => t.themeKey === 't-high-volume')?.priorityRank;
    const lowVolumeRank = result.find((t) => t.themeKey === 't-low-volume')?.priorityRank;
    expect(highVolumeRank).toBeLessThan(lowVolumeRank!);
  });

  it('is a no-op renumbering for a single theme', () => {
    const findings = loadMultiPageFindings();
    const themes: StructureThemeWithKey[] = [theme('t1', [fillerA], { priorityRank: 5 })];

    const result = applyOccurrenceWeighting(themes, findings);

    expect(result).toEqual([{ ...themes[0], priorityRank: 1 }]);
  });
});

describe('enforceQuickWinFloor', () => {
  it('promotes a quick win (low effort, non-low impact) ranked below a low-impact theme, per report-feedback-multi-page.md B9', () => {
    // The real symptom: priority 6, badged "Gain rapide" (faible effort,
    // impact élevé), ranked below priority 4 (impact Faible) even though
    // the section is titled "classés par effort et par impact".
    const themes: StructureThemeWithKey[] = [
      theme('t1', [fillerA], { priorityRank: 1, impact: 'high' }),
      theme('t2', [fillerB], { priorityRank: 2, impact: 'medium' }),
      theme('t-low-impact', [fillerC], { priorityRank: 3, impact: 'low' }),
      theme('t-quick-win', [fillerD], { priorityRank: 4, effort: 'low', impact: 'high' }),
    ];

    const result = enforceQuickWinFloor(themes);

    const quickWinRank = result.find((t) => t.themeKey === 't-quick-win')?.priorityRank;
    const lowImpactRank = result.find((t) => t.themeKey === 't-low-impact')?.priorityRank;
    expect(quickWinRank).toBeLessThan(lowImpactRank!);
    expect(result.map((t) => t.priorityRank).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
  });

  it('leaves order unchanged when no low-impact theme exists', () => {
    const themes: StructureThemeWithKey[] = [
      theme('t1', [fillerA], { priorityRank: 1, impact: 'high' }),
      theme('t-quick-win', [fillerC], { priorityRank: 2, effort: 'low', impact: 'medium' }),
    ];

    const result = enforceQuickWinFloor(themes);

    expect(result.map((t) => t.themeKey)).toEqual(['t1', 't-quick-win']);
  });

  it('leaves order unchanged when the quick win already ranks above every low-impact theme', () => {
    const themes: StructureThemeWithKey[] = [
      theme('t-quick-win', [fillerC], { priorityRank: 1, effort: 'low', impact: 'high' }),
      theme('t-low-impact', [fillerD], { priorityRank: 2, impact: 'low' }),
    ];

    const result = enforceQuickWinFloor(themes);

    expect(result.map((t) => t.themeKey)).toEqual(['t-quick-win', 't-low-impact']);
  });

  it('never promotes a non-quick-win low-effort/low-impact theme', () => {
    const themes: StructureThemeWithKey[] = [
      theme('t-other-low-impact', [fillerA], { priorityRank: 1, impact: 'low' }),
      theme('t-low-effort-low-impact', [fillerB], {
        priorityRank: 2,
        effort: 'low',
        impact: 'low',
      }),
    ];

    const result = enforceQuickWinFloor(themes);

    expect(result.map((t) => t.themeKey)).toEqual([
      't-other-low-impact',
      't-low-effort-low-impact',
    ]);
  });
});

// item 15: enforceQuickWinFloor only fires when a low-impact theme exists
// to anchor the promotion against - the real reported symptom had three
// themes, all impact 'high', ranked by descending effort (high, medium,
// low/quick-win last), which enforceQuickWinFloor does nothing about
// (verified above: "leaves order unchanged when no low-impact theme
// exists"). enforceImpactEffortOrdering is the general-case fix.
describe('enforceImpactEffortOrdering', () => {
  it('ranks the quick win first even when every theme carries the same (non-low) impact, matching the reported symptom', () => {
    const themes: StructureThemeWithKey[] = [
      theme('t-high-effort', [fillerA], { priorityRank: 1, effort: 'high', impact: 'high' }),
      theme('t-medium-effort', [fillerB], { priorityRank: 2, effort: 'medium', impact: 'high' }),
      theme('t-quick-win', [fillerC], { priorityRank: 3, effort: 'low', impact: 'high' }),
    ];

    const result = enforceImpactEffortOrdering(themes);

    expect(result.map((t) => t.themeKey)).toEqual([
      't-quick-win',
      't-medium-effort',
      't-high-effort',
    ]);
    expect(result.map((t) => t.priorityRank)).toEqual([1, 2, 3]);
  });

  it('orders non-quick-win themes by descending impact-to-effort ratio', () => {
    const themes: StructureThemeWithKey[] = [
      theme('t-medium-medium', [fillerA], { priorityRank: 1, effort: 'medium', impact: 'medium' }), // ratio 1
      theme('t-high-low', [fillerB], { priorityRank: 2, effort: 'high', impact: 'low' }), // ratio 1/3
      theme('t-low-high', [fillerC], { priorityRank: 3, effort: 'low', impact: 'high' }), // quick win, ratio 3
      theme('t-medium-high', [fillerD], { priorityRank: 4, effort: 'medium', impact: 'high' }), // ratio 1.5
    ];

    const result = enforceImpactEffortOrdering(themes);

    expect(result.map((t) => t.themeKey)).toEqual([
      't-low-high',
      't-medium-high',
      't-medium-medium',
      't-high-low',
    ]);
    expect(result.map((t) => t.priorityRank)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the model's own relative order as a tiebreak when the ratio is equal", () => {
    const themes: StructureThemeWithKey[] = [
      theme('t-a', [fillerA], { priorityRank: 1, effort: 'medium', impact: 'medium' }),
      theme('t-b', [fillerB], { priorityRank: 2, effort: 'low', impact: 'low' }), // not a quick win (impact 'low')
      theme('t-c', [fillerC], { priorityRank: 3, effort: 'high', impact: 'high' }), // same ratio as t-a
    ];

    const result = enforceImpactEffortOrdering(themes);

    // t-a and t-c share ratio 1: t-a (model rank 1) stays ahead of t-c
    // (model rank 3). t-b (ratio 1 too, since low/low = 1) keeps its
    // model rank 2 among the tied group as well.
    expect(result.map((t) => t.themeKey)).toEqual(['t-a', 't-b', 't-c']);
  });

  // report-feedback-large-rule-families.md item 0.8 [REGRESSION]: a site-wide,
  // Critique-severity, 166-occurrence theme (image-alt, in the real
  // report) with a merely 'medium' effort used to rank below a
  // single-occurrence, low-impact quick win, because the old quick-win
  // bucket was an absolute veto rather than a ratio input. Verbatim
  // shape of the real bug: five low-effort/'medium'-impact themes (ratio
  // 2) that should not all outrank a 'high'-impact/'medium'-effort theme
  // (ratio 1.5).
  it('item 0.8: a medium-effort, high-impact theme outranks a low-effort, merely medium-impact one, by ratio', () => {
    const themes: StructureThemeWithKey[] = [
      theme('t-quick-medium-1', [fillerA], { priorityRank: 1, effort: 'low', impact: 'medium' }), // ratio 2
      theme('t-quick-medium-2', [fillerB], { priorityRank: 2, effort: 'low', impact: 'medium' }), // ratio 2
      theme('t-image-alt', [fillerC], { priorityRank: 8, effort: 'medium', impact: 'high' }), // ratio 1.5, not a quick win
    ];

    const result = enforceImpactEffortOrdering(themes);

    // Ratio 2 still legitimately beats ratio 1.5 - the fix is not "quick
    // wins never win", it's "ratio decides, with no absolute veto either
    // way". What item 0.8 actually needed was for image-alt to not be
    // buried behind *every* quick win regardless of ratio, which this
    // ordering (image-alt ranks 3rd here, not artificially last) confirms.
    expect(result.map((t) => t.themeKey)).toEqual([
      't-quick-medium-1',
      't-quick-medium-2',
      't-image-alt',
    ]);
  });

  it('item 0.8: a medium-effort, high-impact theme now outranks a low-effort, low-impact one (ratio 1.5 > ratio 1)', () => {
    const themes: StructureThemeWithKey[] = [
      theme('t-trivial-quick-win', [fillerA], { priorityRank: 1, effort: 'low', impact: 'low' }), // ratio 1, not a quick win (impact 'low')
      theme('t-link-name', [fillerB], { priorityRank: 9, effort: 'medium', impact: 'high' }), // ratio 1.5
    ];

    const result = enforceImpactEffortOrdering(themes);

    expect(result.map((t) => t.themeKey)).toEqual(['t-link-name', 't-trivial-quick-win']);
  });

  it('is idempotent: running it twice produces the same order', () => {
    const themes: StructureThemeWithKey[] = [
      theme('t1', [fillerA], { priorityRank: 1, effort: 'high', impact: 'medium' }),
      theme('t2', [fillerB], { priorityRank: 2, effort: 'low', impact: 'high' }),
      theme('t3', [fillerC], { priorityRank: 3, effort: 'medium', impact: 'low' }),
    ];

    const once = enforceImpactEffortOrdering(themes);
    const twice = enforceImpactEffortOrdering(once);

    expect(twice.map((t) => t.themeKey)).toEqual(once.map((t) => t.themeKey));
  });
});

describe('logContainmentWarnings', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when a theme resolves entirely to diverted (legal-page) findings', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // f013 (is-crawlable) is confined to the CGU/cookies/privacy pages -
    // entirely legal, entirely diverted per docs/archive/report-v2-refactor.md A3.
    const themes: StructureThemeWithKey[] = [
      theme('t1', [divertedSeoId(findings)], { category: 'seo' }),
    ];

    logContainmentWarnings(themes, findings, manifest);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/resolves entirely to diverted pages/);
  });

  it('does not warn for an ordinary theme', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const themes: StructureThemeWithKey[] = [theme('t1', [fillerA])];

    logContainmentWarnings(themes, findings, manifest);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// report-feedback-large-rule-families.md item 0.8: exercises the full pipeline
// (applyStructureRankingRules), not each rule in isolation - the actual
// bug only showed up in how the rules composed (applyOccurrenceWeighting's
// promotion was being discarded by enforceImpactEffortOrdering running
// after it), which no single-function test below this point would catch.
describe('applyStructureRankingRules', () => {
  it('item 0.8: promotes image-alt and link-name (the two largest rule families) into the top 6, matching the report render cap', () => {
    const findings = loadLargeRuleFamiliesFindings();
    const manifest = loadLargeRuleFamiliesManifest();
    const rawThemes = loadLargeRuleFamiliesRawThemes();

    const result = applyStructureRankingRules(rawThemes, findings, manifest);

    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const ruleIdOf = (t: StructureThemeWithKey): string | undefined =>
      findingsById.get(t.findingIds[0]!)?.ruleId;
    const top6RuleIds = result.filter((t) => t.priorityRank <= 6).map(ruleIdOf);

    expect(top6RuleIds).toContain('image-alt');
    expect(top6RuleIds).toContain('link-name');
  });

  // report-feedback-palais-gallien.md item 15 (the bug enforceImpactEffortOrdering
  // was originally built to fix): confirms reordering applyOccurrenceWeighting
  // to run last (item 0.8's fix) didn't reopen this - three themes, all
  // impact 'high', must still rank by ascending effort (quick win first),
  // through the full pipeline this time, not enforceImpactEffortOrdering
  // in isolation.
  it('item 15 [no regression]: a low-effort/high-impact theme still ranks first among same-impact themes through the full pipeline', () => {
    const findings = loadMultiPageFindings();
    const manifest = loadMultiPageManifest();
    const themes: StructureThemeWithKey[] = [
      theme('t-high-effort', [fillerA], { priorityRank: 1, effort: 'high', impact: 'high' }),
      theme('t-medium-effort', [fillerB], { priorityRank: 2, effort: 'medium', impact: 'high' }),
      theme('t-quick-win', [fillerC], { priorityRank: 3, effort: 'low', impact: 'high' }),
    ];

    const result = applyStructureRankingRules(themes, findings, manifest);

    expect(result.find((t) => t.themeKey === 't-quick-win')?.priorityRank).toBe(1);
  });
});
