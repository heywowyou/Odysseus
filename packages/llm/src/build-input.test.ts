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
} from './build-input.js';
import type { StructureThemeWithKey } from './structure-schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Real committed scan (11 pages, 78 findings), reused as the reference
 *  fixture per CLAUDE.md's testing conventions: "Both bugs found after
 *  Milestone 4 ... passed the entire test suite and were visible only in
 *  a real-site scan." Exercising the severity filter against real,
 *  messy scanner output is more meaningful than a hand-built fixture. */
function loadSasFernandeFindings(): Finding[] {
  const findingsPath = path.join(
    moduleDir,
    '../../../artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/findings.json',
  );
  return JSON.parse(readFileSync(findingsPath, 'utf-8')) as Finding[];
}

function loadSasFernandeManifest(): AuditManifest {
  const manifestPath = path.join(
    moduleDir,
    '../../../artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/manifest.json',
  );
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as AuditManifest;
}

describe('filterFindingsForLlm', () => {
  it('drops the 61 minor findings out of 78 on the real sas-fernande scan', () => {
    const findings = loadSasFernandeFindings();
    expect(findings).toHaveLength(78);

    const filtered = filterFindingsForLlm(findings);

    expect(filtered).toHaveLength(17);
    expect(filtered.every((f) => f.severity !== 'minor')).toBe(true);
  });

  it('keeps critical, serious, and moderate findings', () => {
    const findings = loadSasFernandeFindings();
    const filtered = filterFindingsForLlm(findings);

    const bySeverity = { critical: 0, serious: 0, moderate: 0 };
    for (const f of filtered) {
      if (f.severity === 'critical' || f.severity === 'serious' || f.severity === 'moderate') {
        bySeverity[f.severity]++;
      }
    }
    expect(bySeverity).toEqual({ critical: 7, serious: 8, moderate: 2 });
  });
});

describe('buildStructureInput', () => {
  it('maps filtered findings to the StructureInput.findings Pick shape, no language field', () => {
    const filtered = filterFindingsForLlm(loadSasFernandeFindings());
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
      pageUrls: source.pageUrls,
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
});

describe('buildWritingInput', () => {
  it('groups each structure theme with the finding records for its findingIds', () => {
    const filtered = filterFindingsForLlm(loadSasFernandeFindings());
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

    const siteStats = computeSiteStats(loadSasFernandeFindings(), loadSasFernandeManifest());
    const input = buildWritingInput(structureThemes, filtered, siteContext, 'fr', siteStats, null);

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
          pageUrls: first.pageUrls,
          occurrences: first.occurrences,
        },
      ],
    });
    expect(input.themes[1]!.findings).toHaveLength(structureThemes[1]!.findingIds.length);
  });

  it('throws when a structure theme references a findingId no longer in the current findings', () => {
    const filtered = filterFindingsForLlm(loadSasFernandeFindings());
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

    const siteStats = computeSiteStats(loadSasFernandeFindings(), loadSasFernandeManifest());
    expect(() => buildWritingInput(staleThemes, filtered, siteContext, 'fr', siteStats, null)).toThrow(
      /references unknown findingId/,
    );
  });
});

describe('computeSiteStats', () => {
  it('computes the full severity breakdown from unfiltered findings on the real sas-fernande scan', () => {
    const stats = computeSiteStats(loadSasFernandeFindings(), loadSasFernandeManifest());

    expect(stats).toEqual({
      pagesScanned: 11,
      totalFindings: 78,
      critical: 7,
      serious: 8,
      moderate: 2,
      minor: 61,
    });
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
