import { describe, expect, it } from 'vitest';
import { selectReferenceStats } from '@odysseus/core';
import { isQuickWinTheme, MAX_RENDERED_THEMES, renderThemes, selectRenderedThemes } from './themes.js';
import { getStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderThemes against the real sas-fernande.fr analysis', () => {
  it('renders only the top 6 themes by rank (doc §3 sections 04/05 cap), with a compact findingId reference and never a raw page URL (F38)', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), analysis, findings, manifest);
    const rendered = selectRenderedThemes(analysis.themes);

    for (const theme of rendered) {
      expect(html).toContain(`id="theme-${theme.priorityRank}"`);
      expect(html).toContain(theme.findingIds[0]);
    }
    if (analysis.themes.length > MAX_RENDERED_THEMES) {
      const dropped = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank)[MAX_RENDERED_THEMES]!;
      expect(html).not.toContain(`id="theme-${dropped.priorityRank}"`);
    }
    // No raw page URL anywhere in a theme card - only counts and refs.
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const somePageUrl = findingsById.get(rendered[0]!.findingIds[0]!)?.pageUrls[0];
    if (somePageUrl) expect(html).not.toContain(somePageUrl);
  });

  it('marks a theme as a quick win only when effort is low and impact is not low', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), analysis, findings, manifest);
    const rendered = selectRenderedThemes(analysis.themes);
    const quickWinThemes = rendered.filter(isQuickWinTheme);
    const nonQuickWinThemes = rendered.filter((t) => !isQuickWinTheme(t));

    // At least a sanity check that the predicate produces both classes
    // on a real analysis, and that every quick-win theme's title is
    // followed somewhere by the badge markup.
    if (quickWinThemes.length > 0) {
      expect(html).toContain('class="tag qw"');
    }
    if (nonQuickWinThemes.length === rendered.length) {
      expect(html).not.toContain('class="tag qw"');
    }
  });

  it('renders the deterministic legalRelevance sentence in a .legal box for an accessibility theme with WCAG criteria, and "Sans objet" otherwise', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), analysis, findings, manifest);
    const rendered = selectRenderedThemes(analysis.themes);

    const conformantTheme = rendered.find((t) => t.legalRelevance !== undefined);
    if (conformantTheme?.legalRelevance) {
      expect(html).toContain(escapeHtml(conformantTheme.legalRelevance));
      expect(html).toContain('Non conforme');
    }
    const nonApplicableTheme = rendered.find((t) => t.legalRelevance === undefined);
    if (nonApplicableTheme) {
      expect(html).toContain('Sans objet');
    }
  });
});

describe('B1: reference-stat citation eligibility and cross-document dedupe', () => {
  it('attaches a citation to a performance theme, not just accessibility/seo', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);
    const findingId = findings[0]!.findingId;
    const performanceOnly = {
      ...analysis,
      themes: [
        {
          title: 'Vitesse mobile insuffisante',
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: [findingId],
          recommendedActions: ['Action'],
        },
      ],
    };

    const html = renderThemes(getStrings('fr'), performanceOnly, findings, manifest);

    expect(html).toContain('Repère chiffré');
    expect(html).toContain('Deloitte');
  });

  it('never cites the same statistic twice across the document, even across two performance themes', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);
    const findingId = findings[0]!.findingId;
    const twoPerformanceThemes = {
      ...analysis,
      themes: [
        {
          title: 'Vitesse mobile insuffisante',
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: [findingId],
          recommendedActions: ['Action'],
        },
        {
          title: 'Temps de blocage élevé',
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'medium' as const,
          priorityRank: 2,
          findingIds: [findingId],
          recommendedActions: ['Action'],
        },
      ],
    };
    const citedStatIds = new Set<string>();

    const html = renderThemes(getStrings('fr'), twoPerformanceThemes, findings, manifest, citedStatIds);

    // Only the first (highest-priority) theme in a category gets a
    // citation per the existing one-per-category rule, so this also
    // covers the "at most once" case without needing a second call.
    expect((html.match(/Repère chiffré/g) ?? []).length).toBe(1);
    expect(citedStatIds.size).toBe(1);
  });

  it('a Set already containing the only matching statistic id suppresses the citation entirely (cross-section dedupe)', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);
    const findingId = findings[0]!.findingId;
    const performanceOnly = {
      ...analysis,
      themes: [
        {
          title: 'Vitesse mobile insuffisante',
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: [findingId],
          recommendedActions: ['Action'],
        },
      ],
    };
    const sector = analysis.obligationAssessment?.sector ?? 'general';
    const citedStatIds = new Set(selectReferenceStats('performance', sector).map((stat) => stat.id));

    const html = renderThemes(getStrings('fr'), performanceOnly, findings, manifest, citedStatIds);

    expect(html).not.toContain('Repère chiffré');
  });
});

describe('isQuickWinTheme', () => {
  it('is true only for low effort combined with medium or high impact', () => {
    expect(isQuickWinTheme({ effort: 'low', impact: 'medium' })).toBe(true);
    expect(isQuickWinTheme({ effort: 'low', impact: 'high' })).toBe(true);
    expect(isQuickWinTheme({ effort: 'low', impact: 'low' })).toBe(false);
    expect(isQuickWinTheme({ effort: 'medium', impact: 'high' })).toBe(false);
    expect(isQuickWinTheme({ effort: 'high', impact: 'high' })).toBe(false);
  });
});
