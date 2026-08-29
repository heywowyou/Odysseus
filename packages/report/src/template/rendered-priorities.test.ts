import { describe, expect, it } from 'vitest';
import { LCEN_MENTIONS_LEGALES_RULE_ID } from '@odysseus/core';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';
import { buildRenderedPriorities } from './rendered-priorities.js';

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
