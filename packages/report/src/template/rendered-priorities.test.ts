import { describe, expect, it } from 'vitest';
import type { Finding, Theme } from '@odysseus/core';
import { LCEN_MENTIONS_LEGALES_RULE_ID } from '@odysseus/core';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';
import { buildRenderedPriorities } from './rendered-priorities.js';
import { renderThemes } from './sections/themes.js';
import { getStrings } from './strings/i18n.js';

function buildFinding(overrides: Partial<Finding> & { findingId: string }): Finding {
  return {
    auditId: 'a1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: [],
    title: `Title ${overrides.findingId}`,
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: overrides.findingId,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  };
}

function buildTheme(findingIds: string[]): Theme {
  return {
    title: 'Contraste insuffisant',
    category: 'accessibility',
    businessImpact: 'Impact',
    effort: 'low',
    impact: 'high',
    priorityRank: 1,
    findingIds,
    recommendedActions: ['Action'],
  };
}

describe('buildRenderedPriorities', () => {
  it('assigns contiguous display ranks while preserving model ranks', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('en'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    const themes = analysis.themes.map((theme, index) => ({
      ...theme,
      priorityRank: index === 1 ? 9 : theme.priorityRank,
    }));
    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    expect(priorities.map((priority) => priority.displayRank)).toEqual(
      priorities.map((_, index) => index + 1),
    );
    expect(
      priorities.some((priority) => priority.theme.priorityRank !== priority.displayRank),
    ).toBe(true);
    expect(priorities.every((priority) => priority.remediations.length > 0)).toBe(true);
  });

  it('fails with every missing reviewed rule ID', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('en'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    const usedId = analysis.themes[0]!.findingIds[0]!;
    const changed = findings.map((finding) =>
      finding.findingId === usedId ? { ...finding, ruleId: 'unreviewed-rule' } : finding,
    );
    expect(() => buildRenderedPriorities(analysis.themes, changed, manifest, 'en')).toThrow(
      'unreviewed-rule',
    );
  });

  it('rejects a legacy analysis theme that still contains an LCEN finding', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    const usedId = analysis.themes[0]!.findingIds[0]!;
    const changed = findings.map((finding) =>
      finding.findingId === usedId
        ? { ...finding, ruleId: LCEN_MENTIONS_LEGALES_RULE_ID }
        : finding,
    );
    expect(() => buildRenderedPriorities(analysis.themes, changed, manifest, 'fr')).toThrow(
      'Regenerate the analysis structure',
    );
  });
});

// Plan 018 step 6: RenderedPriority owns a deterministic evidence summary
// consumed by every priority surface, so no template ever re-derives rule
// selection. These tests pin the selection rules themselves: representative
// finding by highest severity then lexicographically smallest findingId,
// representative page as the lexicographically first entry of the
// deduplicated page union, and exact unique-page and occurrence counts.
describe('plan 018 step 6: deterministic priority evidence', () => {
  const manifest = { pages: [] } as never;

  it('breaks a severity tie with the lexicographically smallest findingId, whatever the array order', () => {
    const findings = [buildFinding({ findingId: 'f002' }), buildFinding({ findingId: 'f001' })];
    const themes = [buildTheme(['f002', 'f001'])];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.representativeFinding.findingId).toBe('f001');
    expect(priority.evidence.representativeLabel).toBe('Title f001');
  });

  it('prefers the higher severity over the smaller findingId', () => {
    const findings = [
      buildFinding({ findingId: 'f001', severity: 'serious' }),
      buildFinding({ findingId: 'f009', severity: 'critical' }),
    ];
    const themes = [buildTheme(['f001', 'f009'])];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.representativeFinding.findingId).toBe('f009');
  });

  it('picks the lexicographically first page of the deduplicated union and carries exact counts', () => {
    const longUrl =
      'https://example.com/very/long/path/that/keeps/going/and-going/beyond/any/reasonable/width/b';
    const findings = [
      buildFinding({
        findingId: 'f001',
        occurrences: 2,
        pageUrls: [longUrl, 'https://example.com/a'],
      }),
      buildFinding({
        findingId: 'f002',
        occurrences: 3,
        pageUrls: ['https://example.com/a'],
        severity: 'critical',
      }),
    ];
    const themes = [buildTheme(['f001', 'f002'])];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    // The union is {longUrl, /a}; /a sorts first. The duplicate /a entry is
    // counted once, not twice.
    expect(priority.evidence.representativePageUrl).toBe('https://example.com/a');
    expect(priority.evidence.uniquePageCount).toBe(2);
    // Occurrences sum across every finding in the priority, not the max.
    expect(priority.evidence.occurrenceCount).toBe(5);
    // The critical finding wins the representative slot (see the rule above).
    expect(priority.evidence.representativeFinding.findingId).toBe('f002');
  });

  it('carries zero-page evidence unchanged when no finding in the priority has a page URL', () => {
    const findings = [
      buildFinding({ findingId: 'f001', pageUrls: [], occurrences: 2 }),
      buildFinding({ findingId: 'f002', pageUrls: [], occurrences: 3 }),
    ];
    const themes = [buildTheme(['f001', 'f002'])];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.representativePageUrl).toBeUndefined();
    expect(priority.evidence.uniquePageCount).toBe(0);
    expect(priority.evidence.occurrenceCount).toBe(5);
  });

  it('resolves the representative label through the shared helper: reviewed French rule label in fr, scanner title in en', async () => {
    const findings = [buildFinding({ findingId: 'f001', ruleId: 'color-contrast' })];
    const themes = [buildTheme(['f001'])];

    const enPriorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const enPriority = enPriorities[0]!;
    const frPriorities = buildRenderedPriorities(themes, findings, manifest, 'fr');
    const frPriority = frPriorities[0]!;

    expect(enPriority.evidence.representativeLabel).toBe('Title f001');
    // Same reviewed label the findings appendix renders for this rule.
    expect(frPriority.evidence.representativeLabel).toBe(
      'Le contraste des couleurs est insuffisant',
    );
  });

  it('reaches the theme card HTML escaped: a scanner title carrying markup cannot execute through the observation', async () => {
    const analysis = await loadSmallSiteAnalysis('fr');
    const findings = [
      buildFinding({
        findingId: 'f001',
        ruleId: 'rule-not-in-the-translations',
        title: '<img src=x onerror=alert(1)>',
      }),
    ];
    const themes = [buildTheme(['f001'])];
    const withThemes = { ...analysis, themes };

    const html = renderThemes(getStrings('fr'), 4, withThemes, findings, manifest);

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
