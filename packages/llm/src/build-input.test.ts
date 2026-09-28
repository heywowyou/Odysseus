import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import {
  buildFallbackSiteContext,
  buildStructureInput,
  buildWritingInput,
  computeSiteStats,
  filterFindingsForLlm,
  MAX_PAGE_URLS_FOR_LLM,
  MAX_PAGE_URL_CHARS_FOR_LLM,
} from './build-input.js';
import type { StructureThemeWithKey } from './structure-schema.js';
import { emptyWritingPerformanceEvidence } from './writing-schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Real committed scan (11 pages, 78 findings), reused as the reference
 *  fixture per CLAUDE.md's testing conventions: "Both bugs found after
 *  Milestone 4 ... passed the entire test suite and were visible only in
 *  a real-site scan." Exercising the severity filter against real,
 *  messy scanner output is more meaningful than a hand-built fixture. */
function loadSmallSiteFindings(): Finding[] {
  const findingsPath = path.join(
    moduleDir,
    '../../../fixtures/test-audits/small-site/findings.json',
  );
  return JSON.parse(readFileSync(findingsPath, 'utf-8')) as Finding[];
}

function loadSmallSiteManifest(): AuditManifest {
  const manifestPath = path.join(
    moduleDir,
    '../../../fixtures/test-audits/small-site/manifest.json',
  );
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as AuditManifest;
}

/** 2026-08-25: these used to pin the fixture's absolute counts (78 findings,
 *  61 of them minor). That is the wrong thing to assert here. The fixture is
 *  re-derivable at any time with `normalize <dir>`, and every dedupe or
 *  collapse change legitimately moves those numbers - re-normalizing it this
 *  session moved 78 to 42, and the suite had been green only because the
 *  fixture predated collapses that shipped weeks earlier. What this filter
 *  actually promises is "drop exactly the minor findings and nothing else",
 *  so that is what is asserted, against whatever the fixture currently holds.
 *  Absolute counts still belong in statistics.test.ts, where the number
 *  itself is the thing under test. */
describe('filterFindingsForLlm', () => {
  it('drops exactly the minor findings on the real small-site scan', () => {
    const findings = loadSmallSiteFindings();
    const minorCount = findings.filter((f) => f.severity === 'minor').length;
    expect(minorCount).toBeGreaterThan(0);

    const filtered = filterFindingsForLlm(findings);

    expect(filtered).toHaveLength(findings.length - minorCount);
    expect(filtered.every((f) => f.severity !== 'minor')).toBe(true);
  });

  it('keeps every critical, serious, and moderate finding, changing none of them', () => {
    const findings = loadSmallSiteFindings();
    const filtered = filterFindingsForLlm(findings);

    const count = (severity: string, list: readonly Finding[]): number =>
      list.filter((f) => f.severity === severity).length;

    for (const severity of ['critical', 'serious', 'moderate'] as const) {
      expect(count(severity, filtered)).toBe(count(severity, findings));
      expect(count(severity, filtered)).toBeGreaterThan(0);
    }
  });
});

describe('buildStructureInput', () => {
  it('maps filtered findings to the StructureInput.findings Pick shape, no language field', () => {
    const filtered = filterFindingsForLlm(loadSmallSiteFindings());
    const siteContext = buildFallbackSiteContext();

    const input = buildStructureInput(filtered, siteContext);

    expect(input.siteContext).toBe(siteContext);
    expect(input.findings).toHaveLength(filtered.length);
    expect('language' in input).toBe(false);

    const mapped = input.findings[0];
    const source = filtered[0];
    if (!mapped || !source) throw new Error('expected at least one finding');
    expect(mapped).toEqual({
      findingId: source.findingId,
      source: source.source,
      ruleId: source.ruleId,
      category: source.category,
      severity: source.severity,
      wcagCriteria: source.wcagCriteria,
      title: source.title,
      description: source.description,
      pageUrls: source.pageUrls.slice(0, MAX_PAGE_URLS_FOR_LLM),
      occurrences: source.occurrences,
    });

    // Only the Pick<Finding, ...> fields should be present - no
    // rawEvidence, dedupeKey, elements, auditId, etc.
    expect(Object.keys(mapped).sort()).toEqual(
      [
        'findingId',
        'source',
        'ruleId',
        'category',
        'severity',
        'wcagCriteria',
        'title',
        'description',
        'pageUrls',
        'occurrences',
      ].sort(),
    );
  });

  it('caps pageUrls at MAX_PAGE_URLS_FOR_LLM, even when a finding has far more', () => {
    const filtered = filterFindingsForLlm(loadSmallSiteFindings());
    const siteContext = buildFallbackSiteContext();
    const manyUrls = Array.from({ length: 200 }, (_, i) => `https://client.example/page-${i}`);
    const findingWithManyUrls: Finding = { ...filtered[0]!, pageUrls: manyUrls };

    const input = buildStructureInput([findingWithManyUrls, ...filtered.slice(1)], siteContext);

    expect(input.findings[0]!.pageUrls).toHaveLength(MAX_PAGE_URLS_FOR_LLM);
    expect(input.findings[0]!.pageUrls).toEqual(manyUrls.slice(0, MAX_PAGE_URLS_FOR_LLM));
    // occurrences (the model's actual "how widespread" signal) is untouched.
    expect(input.findings[0]!.occurrences).toBe(findingWithManyUrls.occurrences);
  });

  it('bounds each site-controlled page URL before sending it to the model', () => {
    const finding = loadSmallSiteFindings()[0]!;
    const longUrl = `https://client.example/${'x'.repeat(500)}`;
    const input = buildStructureInput(
      [{ ...finding, pageUrls: [longUrl] }],
      buildFallbackSiteContext(),
    );

    expect(input.findings[0]!.pageUrls[0]).toHaveLength(MAX_PAGE_URL_CHARS_FOR_LLM);
    expect(input.findings[0]!.pageUrls[0]?.endsWith(' […]')).toBe(true);
  });
});

describe('buildWritingInput', () => {
  it('describes only the site findings of a theme that also holds findings inside an embedded frame', () => {
    const base = filterFindingsForLlm(loadSmallSiteFindings())[0];
    if (!base) throw new Error('expected at least one finding in the fixture');
    const inFrame = (findingId: string, selector: string): Finding => ({
      ...base,
      findingId,
      elements: [{ ...base.elements[0]!, selector }],
    });
    const siteWide = inFrame('f003', 'footer .social > a');
    const frameButton = inFrame('f001', 'iframe.booking >>> button.guests');
    const frameLink = inFrame('f002', 'iframe.booking >>> a.logo');
    const theme = (themeKey: string, findingIds: string[]): StructureThemeWithKey => ({
      themeKey,
      findingIds,
      category: base.category as StructureThemeWithKey['category'],
      effort: 'high',
      impact: 'high',
      priorityRank: 1,
    });

    const input = buildWritingInput(
      [theme('mixed', ['f001', 'f002', 'f003']), theme('frame-only', ['f001', 'f002'])],
      [siteWide, frameButton, frameLink],
      buildFallbackSiteContext(),
      'fr',
      computeSiteStats(loadSmallSiteFindings(), loadSmallSiteManifest()),
      emptyWritingPerformanceEvidence(),
      {},
      'unknown',
    );

    expect(input.themes[0]!.findings.map((f) => f.findingId)).toEqual(['f003']);
    expect(input.themes[1]!.findings.map((f) => f.findingId)).toEqual(['f001', 'f002']);
  });

  it('never shows the writer an unconfirmed rule finding beside the site findings of its theme (issue #543)', () => {
    const base = filterFindingsForLlm(loadSmallSiteFindings())[0];
    if (!base) throw new Error('expected at least one finding in the fixture');
    const confirmed: Finding = { ...base, findingId: 'f010' };
    const unconfirmed: Finding = {
      ...base,
      findingId: 'f011',
      ruleId: 'focus-order-mismatch',
      source: 'custom',
    };

    const input = buildWritingInput(
      [
        {
          themeKey: 't1',
          findingIds: ['f010', 'f011'],
          category: base.category as StructureThemeWithKey['category'],
          effort: 'low',
          impact: 'high',
          priorityRank: 1,
        },
      ],
      [confirmed, unconfirmed],
      buildFallbackSiteContext(),
      'fr',
      computeSiteStats(loadSmallSiteFindings(), loadSmallSiteManifest()),
      emptyWritingPerformanceEvidence(),
      {},
      'unknown',
    );

    expect(input.themes[0]!.findings.map((f) => f.findingId)).toEqual(['f010']);
  });

  it('groups each structure theme with the finding records for its findingIds', () => {
    const filtered = filterFindingsForLlm(loadSmallSiteFindings());
    const siteContext = buildFallbackSiteContext();
    const [first, second, ...rest] = filtered;
    if (!first || !second) throw new Error('expected at least two findings in the fixture');

    const structureThemes: StructureThemeWithKey[] = [
      {
        themeKey: 't1',
        findingIds: [first.findingId],
        // Cast, not a widened schema: this fixture predates milestone
        // 8.5a's 'geo' category and never actually contains it - the
        // structure-pass schema's own category enum is out of scope for
        // this milestone (see CLAUDE.md trade-off 7 on why it is a
        // deliberately narrow, hand-maintained mirror).
        category: first.category as StructureThemeWithKey['category'],
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
      },
      {
        themeKey: 't2',
        findingIds: [second.findingId, ...rest.slice(0, 1).map((f) => f.findingId)],
        category: second.category as StructureThemeWithKey['category'],
        effort: 'medium',
        impact: 'medium',
        priorityRank: 2,
      },
    ];

    const siteStats = computeSiteStats(loadSmallSiteFindings(), loadSmallSiteManifest());
    const input = buildWritingInput(
      structureThemes,
      filtered,
      siteContext,
      'fr',
      siteStats,
      emptyWritingPerformanceEvidence(),
      {},
      'unknown',
    );

    expect(input.language).toBe('fr');
    expect(input.siteContext).toBe(siteContext);
    expect(input.themes).toHaveLength(2);
    expect(input.themes[0]).toEqual({
      themeKey: 't1',
      category: first.category,
      findings: [
        {
          findingId: first.findingId,
          source: first.source,
          ruleId: first.ruleId,
          category: first.category,
          severity: first.severity,
          wcagCriteria: first.wcagCriteria,
          title: first.title,
          description: first.description,
          pageUrls: first.pageUrls.slice(0, MAX_PAGE_URLS_FOR_LLM),
          occurrences: first.occurrences,
        },
      ],
      trustedRemediations: [],
    });
    expect(input.themes[1]!.findings).toHaveLength(structureThemes[1]!.findingIds.length);
    expect(
      input.themes[0]!.findings.some((finding) => finding.findingId === second.findingId),
    ).toBe(false);
    expect(input.themes[1]!.findings.some((finding) => finding.findingId === first.findingId)).toBe(
      false,
    );
  });

  it('builds the executive-summary packet deterministically from site stats, categories, and reconciled performance evidence', () => {
    const filtered = filterFindingsForLlm(loadSmallSiteFindings());
    const [first] = filtered;
    if (!first) throw new Error('expected at least one finding in the fixture');
    const siteStats = computeSiteStats(loadSmallSiteFindings(), loadSmallSiteManifest());
    const performanceEvidence = {
      fieldDataAvailable: true,
      observations: [
        { metric: 'cls' as const, source: 'field' as const, value: 0.18, rating: 'mid' as const },
        { metric: 'lcp' as const, source: 'field' as const, value: 2400, rating: 'good' as const },
        { metric: 'lcp' as const, source: 'lab' as const, value: 20_000, rating: 'poor' as const },
      ],
      discordances: [
        {
          field: {
            metric: 'lcp' as const,
            source: 'field' as const,
            value: 2400,
            rating: 'good' as const,
          },
          lab: {
            metric: 'lcp' as const,
            source: 'lab' as const,
            value: 20_000,
            rating: 'poor' as const,
          },
          labNonRepresentativeForRecommendations: true as const,
        },
      ],
      primaryConcern: {
        metric: 'cls' as const,
        source: 'field' as const,
        value: 0.18,
        rating: 'mid' as const,
      },
      suppressedLabRecommendations: ['lcp' as const],
    };
    const input = buildWritingInput(
      [
        {
          themeKey: 't1',
          findingIds: [first.findingId],
          category: first.category as StructureThemeWithKey['category'],
          effort: 'low',
          impact: 'high',
          priorityRank: 1,
        },
      ],
      filtered,
      buildFallbackSiteContext(),
      'fr',
      siteStats,
      performanceEvidence,
      {},
      'unknown',
      'audit-1',
      'in_scope',
      ['Certaines vérifications importantes sont indisponibles.'],
    );

    expect(input.summaryEvidence.siteStats).toEqual(siteStats);
    expect(input.summaryEvidence.performance).toBe(performanceEvidence);
    expect(input.summaryEvidence.rankedThemes).toEqual([
      { themeKey: 't1', category: first.category, priorityRank: 1 },
    ]);
    expect(input.summaryEvidence.obligationStatus).toBe('in_scope');
    expect(input.summaryEvidence.categoriesPresent).toEqual(
      [...new Set(filtered.map((finding) => finding.category))].sort(),
    );
    expect(input.summaryEvidence.limitations).toEqual([
      'Certaines vérifications importantes sont indisponibles.',
    ]);
  });

  it('throws when a structure theme references a findingId no longer in the current findings', () => {
    const filtered = filterFindingsForLlm(loadSmallSiteFindings());
    const siteContext = buildFallbackSiteContext();
    const staleThemes: StructureThemeWithKey[] = [
      {
        themeKey: 't1',
        findingIds: ['this-finding-id-does-not-exist'],
        category: 'accessibility',
        effort: 'low',
        impact: 'low',
        priorityRank: 1,
      },
    ];

    const siteStats = computeSiteStats(loadSmallSiteFindings(), loadSmallSiteManifest());
    expect(() =>
      buildWritingInput(
        staleThemes,
        filtered,
        siteContext,
        'fr',
        siteStats,
        emptyWritingPerformanceEvidence(),
        {},
        'unknown',
      ),
    ).toThrow(/references unknown findingId/);
  });
});

describe('computeSiteStats', () => {
  it('computes the full severity breakdown from unfiltered findings on the real small-site scan', () => {
    const stats = computeSiteStats(loadSmallSiteFindings(), loadSmallSiteManifest());

    // Derived from the fixture rather than pinned to a snapshot of it, for
    // the reason given above filterFindingsForLlm: the severity mix moves
    // whenever dedupe or a collapse changes, and re-pinning it each time
    // tests nothing. What must hold is that the breakdown is computed from
    // the UNFILTERED findings (the minor ones are the whole point of this
    // function existing separately from filterFindingsForLlm) and that it
    // accounts for every one of them. pagesScanned is a property of the scan,
    // not of normalization, so it stays a literal.
    const findings = loadSmallSiteFindings();
    const count = (severity: string): number =>
      findings.filter((f) => f.severity === severity).length;

    expect(stats.pagesScanned).toBe(11);
    expect(stats.totalFindings).toBe(findings.length);
    expect(stats.critical).toBe(count('critical'));
    expect(stats.serious).toBe(count('serious'));
    expect(stats.moderate).toBe(count('moderate'));
    expect(stats.minor).toBe(count('minor'));
    expect(stats.minor).toBeGreaterThan(0);
    expect(stats.critical + stats.serious + stats.moderate + stats.minor).toBe(stats.totalFindings);
  });
});

describe('buildFallbackSiteContext', () => {
  it('returns placeholder values that do not claim real intake data', () => {
    const context = buildFallbackSiteContext();

    expect(context).toEqual({
      businessType: 'unknown (no intake context provided)',
      primaryGoal: 'unknown (no intake context provided)',
      languagesServed: [],
      targetMarkets: [],
    });
  });
});
