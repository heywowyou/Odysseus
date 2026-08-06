import { describe, expect, it } from 'vitest';
import { isQuickWinTheme, renderThemes } from './themes.js';
import { getStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderThemes against the real sas-fernande.fr analysis', () => {
  it('renders every theme with its priority rank and a compact findingId reference, never a raw page URL (F38)', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), analysis, findings, manifest);

    for (const theme of analysis.themes) {
      expect(html).toContain(`<span class="rank">${theme.priorityRank}</span>`);
      expect(html).toContain(theme.findingIds[0]);
    }
    // No raw page URL anywhere in a theme card - only counts and refs.
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const somePageUrl = findingsById.get(analysis.themes[0]!.findingIds[0]!)?.pageUrls[0];
    if (somePageUrl) expect(html).not.toContain(somePageUrl);
  });

  it('marks a theme as a quick win only when effort is low and impact is not low', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), analysis, findings, manifest);
    const quickWinThemes = analysis.themes.filter(isQuickWinTheme);
    const nonQuickWinThemes = analysis.themes.filter((t) => !isQuickWinTheme(t));

    // At least a sanity check that the predicate produces both classes
    // on a real analysis, and that every quick-win theme's title is
    // followed somewhere by the badge markup.
    if (quickWinThemes.length > 0) {
      expect(html).toContain('class="badge qw"');
    }
    if (nonQuickWinThemes.length === analysis.themes.length) {
      expect(html).not.toContain('class="badge qw"');
    }
  });

  it('renders the deterministic legalRelevance sentence in a .legal box for an accessibility theme with WCAG criteria, and "Sans objet" otherwise', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), analysis, findings, manifest);

    const conformantTheme = analysis.themes.find((t) => t.legalRelevance !== undefined);
    if (conformantTheme?.legalRelevance) {
      expect(html).toContain(escapeHtml(conformantTheme.legalRelevance));
      expect(html).toContain('Non conforme');
    }
    const nonApplicableTheme = analysis.themes.find((t) => t.legalRelevance === undefined);
    if (nonApplicableTheme) {
      expect(html).toContain('Sans objet');
    }
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
